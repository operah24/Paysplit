import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 30000);

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect((res.body as { status: string }).status).toBe('ok');
      });
  });

  it('exposes the renamed access enrollment route', () => {
    return request(app.getHttpServer()).post('/api/v1/access/enrollments').send({}).expect(400);
  });

  it('protects the access profile route', () => {
    return request(app.getHttpServer()).get('/api/v1/access/profile').expect(401);
  });

  it('does not expose the retired customer auth routes', () => {
    return request(app.getHttpServer()).post('/api/v1/auth/login').send({}).expect(404);
  });

  afterAll(async () => {
    await app.close();
  });
});
