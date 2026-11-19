export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^()\-+=]).{8,}$/;

export const PASSWORD_REGEX_MESSAGE =
  'Password must be at least 8 characters and include at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&_#^()-+=).';
