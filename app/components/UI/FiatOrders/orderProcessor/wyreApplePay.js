import {
	WYRE_API_ENDPOINT,
	WYRE_API_ENDPOINT_TEST,
	WYRE_ACCOUNT_ID,
	WYRE_ACCOUNT_ID_TEST,
	WYRE_MERCHANT_ID,
	WYRE_MERCHANT_ID_TEST
} from 'react-native-dotenv';
import { useCallback, useMemo } from 'react';
import { PaymentRequest } from 'react-native-payments';
import axios from 'axios';
import { FIAT_ORDER_PROVIDERS, FIAT_ORDER_STATES } from '../../../../reducers/fiatOrders';

//* typedefs

/**
 * @typedef {import('../../../../reducers/fiatOrders').FiatOrder} FiatOrder
 */

/**
 * Wyre API errors.
 * Source: https://docs.sendwyre.com/docs/errors
 * @typedef WyreError
 * @property {string} exceptionId A unique identifier for this exception. This is very helpful when contacting support
 * @property {WYRE_ERROR_TYPE} type The category of the exception. See below
 * @property {string} errorCode A more granular specification than type
 * @property {string} message A human-friendly description of the problem
 * @property {string} language Indicates the language of the exception message
 * @property {boolean} transient In rare cases, an exception may signal true here to indicate a transient problem. This means the request can be safely re-attempted
 *
 */

/**
 * @enum {string}
 */
export const WYRE_ERROR_TYPE = {
	ValidationException: 'ValidationException', // The action failed due to problems with the request. 400
	InsufficientFundsException: 'InsufficientFundsException', // You requested the use of more funds in the specified currency than were available. 400
	AccessDeniedException: 'AccessDeniedException', // You lack sufficient privilege to perform the requested. action 401
	TransferException: 'TransferException', // There was a problem completing your transfer request. 400
	MFARequiredException: 'MFARequiredException', // An MFA action is required to complete the request. In general you should not get this exception while using API keys. 400
	CustomerSupportException: 'CustomerSupportException', // Please contact us at support@sendwyre.com to resolve this! 400
	NotFoundException: 'NotFoundException', // You referenced something that could not be located. 404
	RateLimitException: 'RateLimitException', // Your requests have exceeded your usage restrictions. Please contact us if you need this increased. 429
	AccountLockedException: 'AccountLockedException', // The account has had a locked placed on it for potential fraud reasons. The customer should contact Wyre support for follow-up. 400
	LockoutException: 'LockoutException', // The account or IP has been blocked due to detected malicious behavior. 403
	UnknownException: 'UnknownException' // A problem with our services internally. This should rarely happen. 500
};

/**
 * https://docs.sendwyre.com/docs/apple-pay-order-integration
 *
 * @typedef WyreOrder
 * @property {string} id Wallet order id eg: "WO_ELTUVYCAFPG"
 * @property {number} createdAt  Timestamp in UTC eg: 1576263687643
 * @property {string} owner Owner eg: "account:AC_RNWQNRAZFPC"
 * @property {WYRE_ORDER_STATES} status Order status eg: "PROCESSING",
 * @property {string?} transferId  Transfer id or null eg: "TF_MDA6MAY848D",
 * @property {number} sourceAmount Fiat amount of order eg: 1.84,
 * @property {string} sourceCurrency Fiat currency of order eg: "USD",
 * @property {string} destCurrency Crypto currency eg: "ETH",
 * @property {string} dest Destination of transfer eg: "ethereum:0x9E01E0E60dF079136a7a1d4ed97d709D5Fe3e341",
 * @property {string} walletType  Wallet type eg: "APPLE_PAY",
 * @property {string} email Customer email eg: "user@company.com",
 * @property {string?} errorMessage Error message null,
 * @property {string} accountId Account ID: "AC_RNWQNRAZFPC",
 * @property {string} paymentMethodName Display "Visa 2942"
 */

/**
 * https://docs.sendwyre.com/docs/wallet-order-processing
 * @enum {string}
 */
export const WYRE_ORDER_STATES = {
	RUNNING_CHECKS: 'RUNNING_CHECKS',
	FAILED: 'FAILED',
	PROCESSING: 'PROCESSING',
	COMPLETE: 'COMPLETE'
};

/**
 * @typedef WyreTransfer
 *
 * @property {string} transferId Transfer ID eg:"TF_MDA6MAY848D"
 * @property {string} feeCurrency Fee currency "USD"
 * @property {number} fee Fee
 * @property {object} fees Fees object
 * @property {number} fees.ETH Fees in ETH
 * @property {number} fees.USD Fees in USD
 * @property {string} sourceCurrency Source currency eg: "USD"
 * @property {string} destCurrency eg: "ETH"
 * @property {number} sourceAmount Source amount eg: 1.84
 * @property {number} destAmount Dest amount eg: 0.001985533306564713
 * @property {string} destSrn Destination address eg: "ethereum:0x9E01E0E60dF079136a7a1d4ed97d709D5Fe3e341"
 * @property {string} from eg: "Walletorderholding WO_ELTUVYCAFPG"
 * @property {string} to
 * @property {number} rate rate eg: 0.0019760479041916164
 * @property {string?} customId customId eg:null
 * @property {string} status status eg:COMPLETED
 * @property {string?} blockchainNetworkTx Transfer transaction hash
 * @property {string?} message
 * @property {string} transferHistoryEntryType eg: "OUTGOING"
 * @property {Array.<{statusDetail: string, state: string, createdAt: number}>} successTimeline
 * @property {Array.<{statusDetail: string, state: string, createdAt: number}>} failedTimeline
 * @property {string?} failureReason
 * @property {string?} reversalReason
 */

//* Constants */

const isDevelopment = process.env.NODE_ENV !== 'production';
const merchantIdentifier = 'test' || isDevelopment ? WYRE_MERCHANT_ID_TEST : WYRE_MERCHANT_ID;
const partnerId = isDevelopment ? WYRE_ACCOUNT_ID_TEST : WYRE_ACCOUNT_ID;

export const WYRE_IS_PROMOTION = true;
export const WYRE_FEE_PERCENT = WYRE_IS_PROMOTION ? 0 : 2.9;
export const WYRE_FEE_FLAT = WYRE_IS_PROMOTION ? 0 : 0.3;

//* API */

const wyreAPI = axios.create({
	baseURL: isDevelopment ? WYRE_API_ENDPOINT_TEST : WYRE_API_ENDPOINT
});

const createFiatOrder = payload =>
	wyreAPI.post('v3/apple-pay/process/partner', payload, {
		// * This promise will always be resolved, use response.status to handle errors
		validateStatus: status => status >= 200,
		// * Apple Pay timeouts at ~30s without throwing error, we want to catch that before and throw
		timeout: 25000
	});
const getOrderStatus = orderId => wyreAPI.get(`v3/orders/${orderId}`);
const getTransferStatus = transferId => wyreAPI.get(`v2/transfer/${transferId}/track`);

//* Helpers

const destToAddress = dest => (dest.indexOf('ethereum:') === 0 ? dest.substring(9) : dest);

export class WyreException extends Error {
	/**
	 * Creates a WyreException based on a WyreError
	 * @param {string} message
	 * @param {WYRE_ERROR_TYPE} type
	 * @param {string} exceptionId
	 */
	constructor(message, type, exceptionId) {
		super(message);
		this.type = type;
		this.id = exceptionId;
	}
}

/**
 * Transforms a WyreOrder state into a FiatOrder state
 * @param {WYRE_ORDER_STATES} wyreOrderState
 */
const wyreOrderStateToFiatState = wyreOrderState => {
	switch (wyreOrderState) {
		case WYRE_ORDER_STATES.COMPLETE: {
			return FIAT_ORDER_STATES.COMPLETED;
		}
		case WYRE_ORDER_STATES.FAILED: {
			return FIAT_ORDER_STATES.CANCELLED;
		}
		case WYRE_ORDER_STATES.RUNNING_CHECKS:
		case WYRE_ORDER_STATES.PROCESSING:
		default: {
			return FIAT_ORDER_STATES.PENDING;
		}
	}
};

/**
 * Transforms Wyre order object into a Fiat order object used in the state.
 * @param {WyreOrder} wyreOrder Wyre order object
 * @returns {FiatOrder} Fiat order object to store in the state
 */
const wyreOrderToFiatOrder = wyreOrder => ({
	id: wyreOrder.id,
	provider: FIAT_ORDER_PROVIDERS.WYRE_APPLE_PAY,
	amount: wyreOrder.sourceAmount,
	fee: null,
	cryptoAmount: null,
	cryptoFee: null,
	currency: wyreOrder.sourceCurrency,
	cryptocurrency: wyreOrder.destCurrency,
	state: wyreOrderStateToFiatState(wyreOrder.status),
	account: destToAddress(wyreOrder.dest),
	txHash: null,
	data: {
		order: wyreOrder
	}
});

/**
 * Returns fields present in a WyreTransfer which are not
 * present in a WyreOrder to be assigned in a FiatOrder
 * @param {WyreTransfer} wyreTransfer Wyre transfer object
 * @returns {FiatOrder} Fiat order object to store in the state
 */
const wyreTransferToFiatOrder = wyreTransfer => ({
	fee: wyreTransfer.fee,
	cryptoAmount: wyreTransfer.destAmount,
	cryptoFee: wyreTransfer.fee ? wyreTransfer.fee[wyreTransfer.destCurrency] : null,
	txHash: wyreTransfer.blockchainNetworkTx
});

//* Handlers

export async function processWyreApplePayOrder(order) {
	try {
		const { data } = await getOrderStatus(order.id);
		if (!data) {
			return order;
		}

		const { transferId } = data;

		if (transferId) {
			const transfer = await getTransferStatus(transferId);
			return {
				...order,
				...wyreOrderToFiatOrder(data),
				...wyreTransferToFiatOrder(transfer),
				data: {
					order: data,
					transfer
				}
			};
		}

		return {
			...order,
			...wyreOrderToFiatOrder(data)
		};
	} catch (error) {
		// TODO: report error
		return order;
	}
}

//* Payment Request */

const USD_CURRENCY_CODE = 'USD';
const ETH_CURRENCY_CODE = 'ETH';

const PAYMENT_REQUEST_COMPLETE = {
	SUCCESS: 'success',
	UNKNOWN: 'unknown',
	FAIL: 'fail'
};

const methodData = [
	{
		supportedMethods: ['apple-pay'],
		supportedTypes: ['debit'],
		data: {
			countryCode: 'US',
			currencyCode: USD_CURRENCY_CODE,
			supportedNetworks: ['visa', 'mastercard', 'discover'],
			merchantIdentifier
		}
	}
];

const getPaymentDetails = (cryptoCurrency, amount, fee, total) => ({
	displayItems: [
		{
			amount: { currency: USD_CURRENCY_CODE, value: `${amount}` },
			label: `${cryptoCurrency} Purchase`
		},
		{
			amount: { currency: USD_CURRENCY_CODE, value: `${fee}` },
			label: 'Fee'
		}
	],
	total: {
		amount: { currency: USD_CURRENCY_CODE, value: `${total}` },
		label: 'Wyre'
	}
});

const paymentOptions = {
	requestPayerPhone: true,
	requestPayerEmail: true,
	requestBilling: true
};

const createPayload = (amount, address, paymentDetails) => {
	const {
		billingContact: { postalAddress, name },
		paymentData,
		paymentMethod,
		shippingContact,
		transactionIdentifier
	} = paymentDetails;
	const dest = `ethereum:${address}`;

	const formattedBillingContact = {
		addressLines: postalAddress.street.split('\n'),
		administrativeArea: postalAddress.state,
		country: postalAddress.country,
		countryCode: postalAddress.ISOCountryCode,
		familyName: name.familyName,
		givenName: name.givenName,
		locality: postalAddress.city,
		postalCode: postalAddress.postalCode,
		subAdministrativeArea: postalAddress.subAdministrativeArea,
		subLocality: postalAddress.subLocality
	};

	const formattedShippingContact = {
		...formattedBillingContact,
		emailAddress: shippingContact.emailAddress,
		phoneNumber: shippingContact.phoneNumber
	};

	return {
		partnerId,
		payload: {
			orderRequest: {
				amount,
				dest,
				destCurrency: ETH_CURRENCY_CODE,
				referrerAccountId: partnerId,
				sourceCurrency: USD_CURRENCY_CODE
			},
			paymentObject: {
				billingContact: formattedBillingContact,
				shippingContact: formattedShippingContact,
				token: {
					paymentData,
					paymentMethod: {
						...paymentMethod,
						type: 'debit'
					},
					transactionIdentifier
				}
			}
		}
	};
};

// * Hooks */

export function useWyreApplePay(amount, address, network) {
	const flatFee = useMemo(() => WYRE_FEE_FLAT.toFixed(2), []);
	const percentFee = useMemo(() => WYRE_FEE_PERCENT.toFixed(2), []);
	const percentFeeAmount = useMemo(() => ((Number(amount) * Number(percentFee)) / 100).toFixed(2), [
		amount,
		percentFee
	]);
	const fee = useMemo(() => (Number(percentFeeAmount) + Number(flatFee)).toFixed(2), [flatFee, percentFeeAmount]);
	const total = useMemo(() => Number(amount) + Number(fee), [amount, fee]);
	const paymentDetails = useMemo(() => getPaymentDetails(ETH_CURRENCY_CODE, amount, fee, total), [
		amount,
		fee,
		total
	]);

	const showRequest = useCallback(async () => {
		const paymentRequest = new PaymentRequest(methodData, paymentDetails, paymentOptions);
		try {
			const paymentResponse = await paymentRequest.show();
			if (!paymentResponse) {
				throw new Error('Payment Request Failed');
			}
			const payload = createPayload(total, address, paymentResponse.details);
			const { data, status } = await createFiatOrder(payload);
			if (status >= 200 && status < 300) {
				await paymentResponse.complete(PAYMENT_REQUEST_COMPLETE.SUCCESS);
				return { ...wyreOrderToFiatOrder(data), network };
			}
			paymentResponse.complete(PAYMENT_REQUEST_COMPLETE.FAIL);

			throw new WyreException(data.message, data.type, data.exceptionId);
		} catch (error) {
			if (error.message.includes('AbortError')) {
				return null;
			}
			if (paymentRequest && paymentRequest.abort) {
				paymentRequest.abort();
			}
			throw error;
		}
	}, [address, network, paymentDetails, total]);

	return [showRequest, percentFee, flatFee, percentFeeAmount, fee, total];
}

export function useWyreTerms(navigation) {
	const handleWyreTerms = useCallback(
		() =>
			navigation.navigate('Webview', {
				url: 'https://www.sendwyre.com/user-agreement/',
				title: 'Wyre User Agreement'
			}),
		[navigation]
	);
	return handleWyreTerms;
}
