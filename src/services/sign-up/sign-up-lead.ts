import {
	generateTimeId,
	OPERATION_FIELDS,
	parseObjectToProtobuf,
	parseProtobufToObject,
	removeEmptyKeys,
	removeKeysIfPresent,
} from '@gamaops/backend-framework';
import {
	ISignUpLead,
	ISignUpLeadRequest,
	ISignUpResponse,
	ValidationChannel,
} from '@gamaops/definitions/identity/types/v1';
import { ValidateFunction } from 'ajv';
import Logger from 'bunyan';
import {
	ServerUnaryCall,
} from 'grpc';
import {
	DISTRIBUTED_ROUTING,
} from 'hfxbus';
import {
	Counter,
} from 'prom-client';
import { Type } from 'protobufjs';
import { ApiRuntime } from '../../interfaces';
import {
	validateMobilePhone,
	validateStoredSignUp,
} from '../../validators';
import {
	indexSignUp,
	tryGetSignUpLead,
} from '../../views';
import * as metrics from '../metrics';

export interface ISignUpLeadContext extends ApiRuntime {
	logger: Logger;
	validateSignUpLead: ValidateFunction;
	validateSignUpLeadEmail: ValidateFunction;
	validateSignUpLeadCellphone: ValidateFunction;
	signUpLeadRequestType: Type;
	signUpLeadType: Type;
	callsCounter: Counter;
}

export async function signUpLead(
	this: ISignUpLeadContext,
	call: ServerUnaryCall<ISignUpLeadRequest>,
): Promise<ISignUpResponse> {

	this.callsCounter.inc({function: 'signUpLead'});

	const sourceCallid = call.metadata.get('callid');
	const callid = sourceCallid ? sourceCallid.toString() : generateTimeId();
	const tracing: any = {
		callid,
	};

	const {
		elasticsearch,
		producer,
	} = this.params();

	this.logger.debug({
		...tracing,
		grpc: {
			request: call.request,
		},
	}, 'Request received');

	let signUpLead: ISignUpLead = removeEmptyKeys(call.request.signUpLead);
	let isValid = this.validateSignUpLead(signUpLead);

	if (!isValid) {
		throw this.validateSignUpLead.errors;
	}

	let errors: any;

	switch (signUpLead.validationChannel) {
		case ValidationChannel.EMAIL:
			isValid = this.validateSignUpLeadEmail(signUpLead);
			errors = this.validateSignUpLeadEmail.errors;
			break;
		case ValidationChannel.CELLPHONE:
			isValid = this.validateSignUpLeadCellphone(signUpLead);
			errors = this.validateSignUpLeadCellphone.errors;
			break;
	}

	if (!isValid) {
		throw errors;
	}

	if (signUpLead.cellphone) {
		signUpLead.cellphone = '+' + signUpLead.cellphone.replace(/[^0-9]/g, '');
		validateMobilePhone('.cellphone', signUpLead.cellphone);
	}

	const storedSignUpLead = await tryGetSignUpLead(elasticsearch, signUpLead);

	if (storedSignUpLead) {
		validateStoredSignUp(storedSignUpLead);
		signUpLead.signUpId = storedSignUpLead.signUpId;
	}

	removeKeysIfPresent(signUpLead, ...OPERATION_FIELDS);

	const signUpLeadRequest = parseObjectToProtobuf(
		call.request,
		this.signUpLeadRequestType,
	);

	let job = producer.job(generateTimeId());

	tracing.jobs = [
		{
			id: job.id,
			stream: 'SignUpLead',
			groups: [
				'IdentityService',
			],
			role: 'producer',
		},
	];

	this.logger.info({
		...tracing,
		command: {
			data: call.request,
			service: 'SignUpService',
			method: 'signUpLead',
		},
	});

	await job
		.set('request', signUpLeadRequest)
		.push();

	job = await producer.send({
		job,
		stream: 'SignUpLead',
		route: DISTRIBUTED_ROUTING,
		rejectOnError: true,
		waitFor: [
			'IdentityService',
		],
	});

	await job.finished();

	const result = await job
		.get('signUpLead', true)
		.del('signUpLead')
		.pull();

	signUpLead = parseProtobufToObject<ISignUpLead>(
		result.signUpLead,
		this.signUpLeadType,
	);

	removeEmptyKeys(signUpLead);

	indexSignUp(elasticsearch, signUpLead);

	this.logger.debug({
		...tracing,
		signUpId: signUpLead.signUpId,
	}, 'Lead indexed');

	return {
		signUpId: signUpLead.signUpId!,
	};

}

export default (runtime: ApiRuntime) => {

	const {
		schemaValidator,
		protos,
		logger,
	} = runtime.params();

	const callsCounter = metrics.signUpCallsCounter;
	const validateSignUpLead = schemaValidator.getSchema('identity.v1.SignUpLead');
	const validateSignUpLeadEmail = schemaValidator.getSchema('identity.v1.SignUpLead.email');
	const validateSignUpLeadCellphone = schemaValidator.getSchema('identity.v1.SignUpLead.cellphone');
	const signUpLeadRequestType = protos.lookupType('identity.v1.SignUpLeadRequest');
	const signUpLeadType = protos.lookupType('identity.v1.SignUpLead');

	runtime.contextify(
		signUpLead,
		{
			logger: logger.child({service: 'identity', function: 'signUpLead' }),
			validateSignUpLead,
			validateSignUpLeadEmail,
			validateSignUpLeadCellphone,
			signUpLeadRequestType,
			signUpLeadType,
			callsCounter,
		},
		{
			logErrors: 'async',
		},
	);

};
