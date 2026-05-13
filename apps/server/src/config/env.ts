import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PORT = 4000;

function parsePort(value: string | undefined) {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT),
};
