import { DataValidationError } from '@gamaops/backend-framework';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { ErrorCodes } from '../errors';

export const validateMobilePhone = (dataPath: string, phoneNumber: string): void => {
	const parsedPhoneNumber = parsePhoneNumberFromString(phoneNumber);
	if (!parsedPhoneNumber || !parsedPhoneNumber.isValid()) {
		throw new DataValidationError(
			`${dataPath} is not a valid mobile phone number`,
			ErrorCodes.INVALID_PHONENUMBER
		);
	}

};
