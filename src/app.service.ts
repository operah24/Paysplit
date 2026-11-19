import { Injectable } from '@nestjs/common';

export interface HealthReport {
  status: 'ok';
  uptimeSeconds: number;
}

@Injectable()
export class AppService {
  getHomeInfo() {
    return {
      name: 'PaySplit API',
      description: 'PaySplit Nigeria-first salary autopilot API v1.0',
      docs: '/docs',
      status: 'healthy',
    };
  }

  getHealth(): HealthReport {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
