import { Client } from '@elastic/elasticsearch';
import {
	ISignUpLead,
} from '@gamaops/definitions/identity/types/v1';
import bodybuilder from 'bodybuilder';

export const indexSignUp = async (elasticsearch: Client, signUp: ISignUpLead) => {

	const {
		signUpId,
		...signUpData
	} = signUp;

	await elasticsearch.update({
		index: 'data-identity-sign-up',
		id: signUpId,
		body: {
			doc: signUpData,
			doc_as_upsert: true,
		},
	} as any);

};

export const existsSignUp = async (elasticsearch: Client, signUpId: string): Promise<boolean> => {

	const response = await elasticsearch.exists({
		index: 'data-identity-sign-up',
		id: signUpId,
		_source: false
	} as any);

	return response.body;

}

export const tryGetSignUpLead = async (elasticsearch: Client, signUpLead: ISignUpLead): Promise<ISignUpLead | null> => {

	const builder = bodybuilder();

	if (signUpLead.cellphone) {
		builder.orFilter('term', 'cellphone.keyword', signUpLead.cellphone);
	}

	if (signUpLead.email) {
		builder.orFilter('term', 'email.keyword', signUpLead.email.trim());
	}

	const body: any = builder.build();

	body._source = {
		includes: [
			'_id',
			'createdAt',
			'updatedAt',
			'signedUpAt',
		],
	};
	body.size = 1;

	const response = await elasticsearch.search({
		index: 'data-identity-sign-up',
		body,
	});

	if (response.body.hits.total.value === 0) {
		return null;
	}

	const [doc] = response.body.hits.hits;

	return {
		signUpId: doc._id,
		...doc._source,
	};

};
