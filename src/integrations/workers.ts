import type { AstroIntegration } from 'astro';

export default function workersIntegration(): AstroIntegration {
  return {
    name: 'workers-integration',
    hooks: {
      'astro:build:done': async () => {
        console.log('Workers integration initialized');
      },
    },
  };
}
