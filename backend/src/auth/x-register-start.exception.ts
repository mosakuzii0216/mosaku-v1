export class InvitationStateInvalidException extends Error {
	constructor(public readonly invitationCode: string) {
		super('Invitation state is invalid or missing');
		this.name = 'InvitationStateInvalidException';
	}
}
