import { HttpException, HttpStatus } from '@nestjs/common';

type ErrorFactory = (
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) => HttpException;

const make =
  (status: HttpStatus, error: string): ErrorFactory =>
  (code, message, extra = {}) =>
    new HttpException({ statusCode: status, error, code, message, ...extra }, status);

export const AppError = {
  badRequest: make(HttpStatus.BAD_REQUEST, 'Bad Request'),
  forbidden: make(HttpStatus.FORBIDDEN, 'Forbidden'),
  notFound: make(HttpStatus.NOT_FOUND, 'Not Found'),
  conflict: make(HttpStatus.CONFLICT, 'Conflict'),
  unprocessable: make(HttpStatus.UNPROCESSABLE_ENTITY, 'Unprocessable Entity'),
  badGateway: make(HttpStatus.BAD_GATEWAY, 'Bad Gateway'),
  unavailable: make(HttpStatus.SERVICE_UNAVAILABLE, 'Service Unavailable'),
};
