import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const origins = configService.get<string>('cors.allowedOrigins');
  app.enableCors({
    origin: origins === '*' ? true : origins?.split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.setGlobalPrefix('api', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('PaySplit | Salary Autopilot API')
    .setDescription(
      'A Nigeria-first salary automation API for collecting confirmed income, organizing money into wallets, and executing split rules to bank recipients. ' +
        'Use the bearer token from the access endpoints to explore protected operations.',
    )
    .setVersion('1.0.0')
    .addTag('access', 'Account access, email confirmation, sessions and password recovery')
    .addTag('kyc', 'Nigeria identity verification with BVN/NIN and liveness')
    .addTag('beneficiaries', 'Verified Nigerian bank recipients')
    .addTag('wallets', 'Purpose-based internal money buckets')
    .addTag('split-rules', 'Rules that decide how confirmed salary is allocated')
    .addTag('salary-account', 'Dedicated salary collection account and balance')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'PaySplit | Salary Autopilot Docs',
    customCss: `
      .swagger-ui .topbar { background: #102a43; }
      .swagger-ui .topbar a { display: flex; align-items: center; }
      .swagger-ui .topbar a::after { content: 'Salary Autopilot'; color: #8fe3cf; font-size: 14px; margin-left: 12px; }
      .swagger-ui .info .title { color: #102a43; }
      .swagger-ui .opblock-tag { color: #0f766e; }
      .swagger-ui .btn.authorize { border-color: #0f766e; color: #0f766e; }
    `,
  });

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  console.log(`Swagger documentation available on: http://localhost:${port}/docs`);
}
void bootstrap();
