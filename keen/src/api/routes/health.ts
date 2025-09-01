/**
 * keen API Gateway - Health Check Routes
 * System health monitoring endpoints
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { keen } from '../../index.js';

const router = Router();

/**
 * Basic health check
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Test database connectivity
    const keenDB = keen.getInstance();
    await keenDB.getDatabaseManager().query('SELECT 1');
    
    const responseTime = Date.now() - startTime;
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      phase: 'Phase 2 - API Gateway',
      services: {
        database: 'operational',
        authentication: 'operational',
        credit_system: 'operational',
        websocket: 'operational'
      },
      performance: {
        response_time_ms: responseTime,
        database_status: 'connected'
      },
      features: {
        agent_purity: true,
        admin_bypass: true,
        rate_limiting: true,
        audit_logging: true,
        multi_tenant: true,
        websocket_streaming: true
      }
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connectivity failed',
      performance: {
        response_time_ms: responseTime
      },
      services: {
        database: 'offline',
        authentication: 'degraded',
        credit_system: 'offline',
        websocket: 'operational'
      }
    });
  }
}));

/**
 * Detailed health check
 */
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const keenDB = keen.getInstance();
    const systemStatus = await keenDB.getSystemStatus();
    const connectionStats = await keenDB.getDatabaseManager().getConnectionStats();
    
    const responseTime = Date.now() - startTime;
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      phase: 'Phase 2 - API Gateway Complete',
      
      // System overview
      system: {
        platform_ready: systemStatus.platform.ready,
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage()
      },
      
      // Database health
      database: {
        connected: systemStatus.database.connected,
        active_connections: systemStatus.database.activeConnections,
        total_connections: connectionStats.totalConnections,
        idle_connections: connectionStats.idleConnections,
        waiting_connections: connectionStats.waitingConnections // Fixed property name
      },
      
      // Anthropic integration
      anthropic: {
        configured: systemStatus.anthropic.configured,
        model: systemStatus.anthropic.model,
        extended_context: systemStatus.anthropic.extendedContext,
        thinking_enabled: systemStatus.anthropic.thinking,
        beta_headers: systemStatus.anthropic.betaHeaders
      },
      
      // API Gateway features
      api_gateway: {
        authentication: {
          jwt_enabled: true,
          api_keys_enabled: true,
          admin_bypass: true
        },
        rate_limiting: {
          enabled: true,
          admin_exempt: true,
          concurrent_sessions: true
        },
        credit_system: {
          markup_multiplier: 5.0,
          admin_unlimited: true,
          real_time_validation: true
        },
        websocket: {
          enabled: true,
          real_time_streaming: true,
          admin_monitoring: true
        },
        audit_logging: {
          enabled: true,
          security_events: true,
          admin_actions: true,
          compliance_ready: true
        }
      },
      
      // Performance metrics
      performance: {
        response_time_ms: responseTime,
        requests_per_second: 0, // TODO: implement metrics collection
        error_rate: 0,
        avg_response_time: responseTime
      },
      
      // Integration status
      integrations: {
        phase_1_database: 'operational',
        phase_2_api_gateway: 'operational',
        phase_3_agent_core: 'pending',
        phase_4_websockets: 'operational',
        phase_5_dashboard: 'pending'
      }
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      performance: {
        response_time_ms: responseTime
      },
      system: {
        platform_ready: false
      }
    });
  }
}));

/**
 * Readiness probe (for Kubernetes)
 */
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  try {
    const keenDB = keen.getInstance();
    const validation = await keenDB.validatePlatform();
    
    if (validation.ready) {
      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString(),
        services: {
          database: validation.database,
          anthropic: validation.anthropic
        }
      });
    } else {
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        issues: validation.issues,
        services: {
          database: validation.database,
          anthropic: validation.anthropic
        }
      });
    }
  } catch (error) {
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

/**
 * Liveness probe (for Kubernetes)
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - just return 200 if process is running
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
});

export { router as healthRouter };
