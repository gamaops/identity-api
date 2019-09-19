require('dotenv-defaults').config();

import {
	createBackendRuntime,
	createElasticsearchClient,
	getGrpcProtoDescriptor,
	getJsonSchemaValidator,
	loadProtosDefinitions,
	createMetricsServer,
	configureDefaultMetrics,
	enableBackendRuntimeMetrics,
	logger,
} from '@gamaops/backend-framework';
import * as identity from '@gamaops/definitions/identity/types/v1';
import grpc from 'grpc';
import { ConnectionManager, Producer } from 'hfxbus';
import { URL } from 'url';
import { IServicesDescriptors, IServicesParameters, IServicesFunctions } from './interfaces';
import addSignUp from './services/sign-up';
import util from 'util';

configureDefaultMetrics({
	serviceName: process.env.APP_NAME,
});

const metricsUrl = new URL(process.env.METRICS_SERVER_URI!);
const metrics = createMetricsServer({
	host: metricsUrl.hostname,
	port: parseInt(metricsUrl.port),
});

if (process.env.ENABLE_BACKEND_RUNTIME_METRICS === 'true') {
	enableBackendRuntimeMetrics();
}

const execute = async () => {

	metrics.health.set(1);

	logger.info('Loading app');
	logger.debug(process.env, 'Loaded environment variables');

	const redisUrl = new URL(process.env.REDIS_URI!);
	const serverUrl = new URL(process.env.GRPC_SERVER_ADDRESS!);

	logger.info('Loading schemas');

	const schemaValidator = getJsonSchemaValidator();

	logger.info('Schemas loaded');
	logger.info('Loading protos');

	const protos =  loadProtosDefinitions([
		'identity/proto/v1.proto',
		'commons/proto/v1.proto',
	]);

	logger.info('Protos loaded');

	const elasticsearch = createElasticsearchClient({
		node: process.env.ELASTICSEARCH_URI,
	});

	logger.info('Elasticsearch ready');

	const busConnection = ConnectionManager.standalone({
		host: redisUrl.hostname,
		port: parseInt(redisUrl.port),
	});
	const producer = new Producer(busConnection);
	await producer.listen();

	logger.info('Producer ready');

	const server = new grpc.Server();

	const descriptors: IServicesDescriptors = {
		identity: getGrpcProtoDescriptor<identity.IPackageDefinition>([
			'identity/proto/v1.proto',
		]),
	};

	const runtime = createBackendRuntime<IServicesParameters, IServicesFunctions>({
		producer,
		schemaValidator,
		elasticsearch,
		protos,
		logger,
		server,
		descriptors,
	});

	addSignUp(runtime);

	server.bind(serverUrl.host, grpc.ServerCredentials.createInsecure());
	server.start();

	const stopGrpcServer = util.promisify(server.tryShutdown.bind(server)) as () => Promise<void>;

	metrics.health.set(2);
	metrics.up.set(1);

	process.once('SIGTERM', async () => {

		metrics.health.set(1);

		try {
			await stopGrpcServer();
			logger.warn('gRPC server stopped');
		} catch (error) {
			logger.error({error}, 'Error while stopping gRPC server');
		}

		try {
			await busConnection.stop({
				maxWait: parseInt(process.env.REDIS_STOP_TIMEOUT!),
			});
			logger.warn('Bus connection (redis) stopped');
		} catch (error) {
			logger.error({error}, 'Bus connection (redis) stop error');
		}

		try {
			await elasticsearch.close();
			logger.warn('Elasticsearch disconnected');
		} catch (error) {
			logger.error({error}, 'Error while disconnecting elasticsearch');
		}

		metrics.up.set(0);

		try {
			metrics.close();
			logger.warn('Metrics server closed');
		} catch (error) {
			logger.error({error}, 'Error while closing metrics server');
		}

	});

};

execute().then(() => {
	logger.info('App started');
}).catch((error) => {
	logger.fatal({error});
});
