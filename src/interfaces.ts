import { Client } from '@elastic/elasticsearch';
import { IBackendRuntime } from '@gamaops/backend-framework';
import * as identity from '@gamaops/definitions/identity/types/v1';
import { Ajv } from 'ajv';
import Logger from 'bunyan';
import { Server, ServerUnaryCall } from 'grpc';
import { Producer } from 'hfxbus';
import { Root } from 'protobufjs';

export interface IServicesDescriptors {
	identity: identity.IPackageDefinition;
}

export interface IServicesParameters {
	producer: Producer;
	logger: Logger;
	schemaValidator: Ajv;
	protos: Root;
	elasticsearch: Client;
	server: Server;
	descriptors: IServicesDescriptors;
}

export interface IServicesFunctions {
	signUpLead(
		call: ServerUnaryCall<identity.ISignUpLeadRequest>,
	): Promise<identity.ISignUpResponse>;
	validateSignUp(
		call: ServerUnaryCall<identity.IValidateSignUpRequest>,
	): Promise<identity.IValidateSignUpResponse>;
}

export type ApiRuntime = IBackendRuntime<IServicesParameters, IServicesFunctions>;