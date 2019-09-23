import {
	generateTimeId,
	parseObjectToProtobuf,
	parseProtobufToObject,
	removeEmptyKeys,
} from '@gamaops/backend-framework';
import {
	IOperationsDates,
} from '@gamaops/definitions/commons/types/v1';
import {
	IValidateSignUpRequest,
	IValidateSignUpResponse,
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
	validateExistsSignUp,
} from '../../validators';
import { indexSignUp } from '../../views';
import * as metrics from '../metrics';

export interface IValidateSignUpContext extends ApiRuntime {
	logger: Logger;
	validateValidateSignUp: ValidateFunction;
	validateSignUpRequestType: Type;
	validateSignUpResponseType: Type;
	operationsDatesType: Type;
	callsCounter: Counter;
}

export async function validateSignUp(
	this: IValidateSignUpContext,
	call: ServerUnaryCall<IValidateSignUpRequest>,
): Promise<IValidateSignUpResponse> {

	this.callsCounter.inc({function: 'validateSignUp'});

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

	const request: IValidateSignUpRequest = removeEmptyKeys(call.request);
	const isValid = this.validateValidateSignUp(call.request);

	if (!isValid) {
		throw this.validateValidateSignUp.errors;
	}

	await validateExistsSignUp(
		elasticsearch,
		request.signUpId,
	);

	let job = producer.job(generateTimeId());

	const validateSignUpRequest = parseObjectToProtobuf(
		call.request,
		this.validateSignUpRequestType,
	);

	tracing.jobs = [
		{
			id: job.id,
			stream: 'ValidateSignUp',
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
			method: 'validateSignUp',
		},
	});

	await job
		.set('request', validateSignUpRequest)
		.push();

	job = await producer.send({
		job,
		stream: 'ValidateSignUp',
		route: DISTRIBUTED_ROUTING,
		rejectOnError: true,
		waitFor: [
			'IdentityService',
		],
	});

	await job.finished();

	const result = await job
		.get('validateSignUpResponse', true)
		.get('signUpOperationDate', true)
		.del('validateSignUpResponse')
		.del('signUpOperationDate')
		.pull();

	const validateSignUpResponse = parseProtobufToObject<IValidateSignUpResponse>(
		result.validateSignUpResponse,
		this.validateSignUpResponseType,
	);

	if (validateSignUpResponse.success) {

		const operationsDates = parseProtobufToObject<IOperationsDates>(
			result.signUpOperationDate,
			this.operationsDatesType,
		);

		removeEmptyKeys(operationsDates);

		indexSignUp(elasticsearch, {
			signUpId: request.signUpId,
			...operationsDates,
		});

		this.logger.debug({
			...tracing,
			signUpId: request.signUpId,
		}, 'Lead indexed');
	}

	return validateSignUpResponse;

}

export default (runtime: ApiRuntime) => {

	const {
		schemaValidator,
		protos,
		logger,
	} = runtime.params();

	const callsCounter = metrics.signUpCallsCounter;
	const validateValidateSignUp = schemaValidator.getSchema('identity.v1.ValidateSignUp');
	const validateSignUpRequestType = protos.lookupType('identity.v1.ValidateSignUpRequest');
	const validateSignUpResponseType = protos.lookupType('identity.v1.ValidateSignUpResponse');
	const operationsDatesType = protos.lookupType('commons.v1.OperationsDates');

	runtime.contextify(
		validateSignUp,
		{
			logger: logger.child({service: 'identity', function: 'validateSignUp' }),
			validateValidateSignUp,
			validateSignUpRequestType,
			validateSignUpResponseType,
			operationsDatesType,
			callsCounter,
		},
		{
			logErrors: 'async',
		},
	);

};
