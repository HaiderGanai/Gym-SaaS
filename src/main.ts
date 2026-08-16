import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { types } from 'pg';
import { AppModule } from './app.module';

// pg's default DATE (OID 1082) parser builds a JS Date at LOCAL midnight
// (postgres-date's documented behavior), which TypeORM then reads back with
// UTC getters (entity columns are `{ type: 'date', utc: true }`) — on a
// server not running in UTC that silently shifts the calendar day by one.
// Returning the raw 'YYYY-MM-DD' string instead skips Date parsing entirely,
// so a `date` column always round-trips as the exact day stored.
types.setTypeParser(1082, (val) => val);

async function bootstrap() {
  // rawBody: Stripe webhook signature verification needs the unparsed request body
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields from the body
      forbidNonWhitelisted: true, // reject requests that contain unknown fields
      transform: true,       // auto-cast body to DTO class instance
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
