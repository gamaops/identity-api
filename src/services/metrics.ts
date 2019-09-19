import {
	Counter,
} from 'prom-client';

export const signUpCallsCounter = new Counter({
	name: 'sign_up_calls_total',
	help: 'Total calls to sign up service functions',
	labelNames: ['function'],
});