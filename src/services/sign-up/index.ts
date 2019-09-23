import {
	wrapGrpcUnaryMethod,
} from '@gamaops/backend-framework';
import {
	ISignUpLeadRequest,
	ISignUpResponse,
	ISignUpServiceImplementation,
	IValidateSignUpRequest,
	IValidateSignUpResponse,
} from '@gamaops/definitions/identity/types/v1';
import {
	ApiRuntime,
} from '../../interfaces';
import addSignUpLead from './sign-up-lead';
import addValidateSignUp from './validate-sign-up';

export default (runtime: ApiRuntime) => {

	const {
		server,
		schemaValidator,
		descriptors,
		logger,
	} = runtime.params();

	addSignUpLead(runtime);
	addValidateSignUp(runtime);

	const implementation: ISignUpServiceImplementation = {
		signUpLead: wrapGrpcUnaryMethod<ISignUpLeadRequest, ISignUpResponse>(
			{
				logger: logger.child({service: 'identity', function: 'signUpLead' }),
				schemaValidator,
			},
			runtime.fncs().signUpLead,
		),
		validateSignUp: wrapGrpcUnaryMethod<IValidateSignUpRequest, IValidateSignUpResponse>(
			{
				logger: logger.child({service: 'identity', function: 'validateSignUp' }),
				schemaValidator,
			},
			runtime.fncs().validateSignUp,
		),
	};

	server.addService(
		descriptors.identity.identity.v1.SignUpService.service,
		implementation,
	);

};
