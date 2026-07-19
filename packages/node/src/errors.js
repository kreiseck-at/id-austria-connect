class IdaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
class IdaConfigError extends IdaError {
  constructor(message) { super(message, 'config'); }
}
class IdaStateMismatchError extends IdaError {
  constructor(message = 'state stimmt nicht ueberein') { super(message, 'state_mismatch'); }
}
class IdaUserCancelledError extends IdaError {
  constructor(message = 'Anmeldung vom Nutzer abgebrochen') { super(message, 'user_cancelled'); }
}
class IdaTokenError extends IdaError {
  constructor(message) { super(message, 'token'); }
}

module.exports = {
  IdaError, IdaConfigError, IdaStateMismatchError,
  IdaUserCancelledError, IdaTokenError,
};
