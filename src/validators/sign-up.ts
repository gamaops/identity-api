
import { DataValidationError } from '@gamaops/backend-framework';
import * as datefns from 'date-fns';
import { ErrorCodes } from '../errors';
import { Client } from '@elastic/elasticsearch';
import { existsSignUp } from '../views';

const MIN_SIGN_UP_TOKEN_DIFF_SECONDS: number = process.env.MIN_SIGN_UP_TOKEN_DIFF_SECONDS
	? parseInt(process.env.MIN_SIGN_UP_TOKEN_DIFF_SECONDS)
	: 180;

export const validateStoredSignUp = (signUp: {
	updatedAt?: string | Date;
	createdAt?: string | Date;
	signedUpAt?: string | Date;
}): void => {

	if (signUp.signedUpAt) {
		throw new DataValidationError(
			`this lead is already signed up`,
			ErrorCodes.ALREADY_SIGNED_UP
		);
	}

	const lastOperationAt = signUp.updatedAt || signUp.createdAt;

	if (
		lastOperationAt
		&& datefns.differenceInSeconds(
			new Date(),
			typeof lastOperationAt === 'string'
				? datefns.parseISO(lastOperationAt)
				: lastOperationAt,
		) < MIN_SIGN_UP_TOKEN_DIFF_SECONDS
	) {
		throw new DataValidationError(
			`you must wait for at least ${MIN_SIGN_UP_TOKEN_DIFF_SECONDS} seconds before requesting sign up again`,
			ErrorCodes.WAIT_BEFORE_SIGN_UP
		);
	}

};

export const validateExistsSignUp = async (
	elasticsearch: Client,
	signUpId: string
) => {

	const exists = await existsSignUp(elasticsearch, signUpId);

	if (!exists) {
		throw new DataValidationError(
			`this sign up doesn't exist`,
			ErrorCodes.SIGN_UP_NOT_FOUND
		);
	}

};
