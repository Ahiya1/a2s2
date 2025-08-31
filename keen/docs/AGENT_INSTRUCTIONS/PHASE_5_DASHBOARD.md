# Phase 5: Dashboard Frontend Implementation

## Mission

Build keen's **production-grade dashboard** that provides real-time visualization of recursive agent trees, progress monitoring, credit management, and user account management. This is the primary interface where users interact with keen's autonomous development platform.

## Success Criteria

- [ ] **Real-time agent tree visualization** with interactive exploration
- [ ] **Live progress monitoring** with phase transitions and completion status
- [ ] **Credit management interface** with usage analytics and billing integration
- [ ] **User authentication UI** with multi-factor authentication support
- [ ] **Session management** with resumable agent execution
- [ ] **Git operation visualization** with commit history and merge tracking
- [ ] **Responsive design** optimized for desktop, tablet, and mobile
- [ ] **Performance optimization** with sub-second load times
- [ ] **80%+ test coverage** including E2E and accessibility tests
- [ ] **Production deployment** with CDN, caching, and monitoring

## Technology Stack

### Frontend Framework: React + TypeScript

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "@tanstack/react-query": "^4.29.0",
    "react-router-dom": "^6.11.0",
    "@headlessui/react": "^1.7.0",
    "@heroicons/react": "^2.0.0",
    "tailwindcss": "^3.3.0",
    "framer-motion": "^10.12.0",
    "recharts": "^2.6.2",
    "react-flow-renderer": "^11.7.4",
    "socket.io-client": "^4.6.0",
    "@stripe/stripe-js": "^1.54.0"
  },
  "devDependencies": {
    "@testing-library/react": "^13.4.0",
    "@testing-library/jest-dom": "^5.16.5",
    "@testing-library/user-event": "^14.4.3",
    "@playwright/test": "^1.34.0",
    "vite": "^4.3.0",
    "vitest": "^0.31.0",
    "@vitejs/plugin-react": "^4.0.0"
  }
}
```

### Build Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@utils': resolve(__dirname, './src/utils'),
      '@types': resolve(__dirname, './src/types')
    }
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@headlessui/react', '@heroicons/react', 'framer-motion'],
          charts: ['recharts'],
          flow: ['react-flow-renderer']
        }
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
});
```

## Core Components Architecture

### Application Structure

```
src/
├── components/
│   ├── auth/              # Authentication components
│   ├── dashboard/         # Main dashboard views
│   ├── agents/            # Agent management and visualization
│   ├── credits/           # Credit management interface
│   ├── sessions/          # Session management
│   ├── git/               # Git operation visualization
│   ├── ui/                # Reusable UI components
│   └── layout/            # Layout and navigation
├── hooks/
│   ├── useAuth.ts         # Authentication state management
│   ├── useWebSocket.ts    # WebSocket connection management
│   ├── useAgentTree.ts    # Agent tree state and updates
│   └── useCredits.ts      # Credit management
├── services/
│   ├── api.ts             # API client configuration
│   ├── websocket.ts       # WebSocket client
│   └── auth.ts            # Authentication service
├── types/
│   ├── api.ts             # API type definitions
│   ├── agent.ts           # Agent-related types
│   └── websocket.ts       # WebSocket event types
├── utils/
│   ├── formatters.ts      # Data formatting utilities
│   ├── constants.ts       # Application constants
│   └── analytics.ts       # Analytics and tracking
└── styles/
    ├── globals.css        # Global styles and Tailwind imports
    └── components.css     # Component-specific styles
```

### Authentication Integration

```typescript
// hooks/useAuth.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  displayName: string;
  subscriptionTier: 'individual' | 'team' | 'enterprise';
  avatar?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login: (email: string, password: string, mfaToken?: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

export const useAuth = create<AuthState>()(persist(
  (set, get) => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: false,
    
    login: async (email: string, password: string, mfaToken?: string) => {
      set({ isLoading: true });
      
      try {
        const response = await authAPI.login({ email, password, mfaToken });
        
        set({
          user: response.user,
          accessToken: response.tokens.access_token,
          refreshToken: response.tokens.refresh_token,
          isAuthenticated: true,
          isLoading: false
        });
        
        // Start token refresh timer
        scheduleTokenRefresh(response.tokens.expires_in);
        
      } catch (error) {
        set({ isLoading: false });
        
        if (error.code === 'MFA_REQUIRED') {
          throw new MFARequiredError('Multi-factor authentication required');
        }
        
        throw error;
      }
    },
    
    logout: () => {
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false
      });
      
      cancelTokenRefresh();
    },
    
    refreshAuth: async () => {
      const { refreshToken } = get();
      if (!refreshToken) {
        get().logout();
        return;
      }
      
      try {
        const response = await authAPI.refreshToken(refreshToken);
        
        set({
          accessToken: response.access_token,
          refreshToken: response.refresh_token || refreshToken
        });
        
        scheduleTokenRefresh(response.expires_in);
        
      } catch (error) {
        get().logout();
        throw error;
      }
    },
    
    updateProfile: async (updates: Partial<User>) => {
      const { user, accessToken } = get();
      if (!user || !accessToken) return;
      
      const updatedUser = await authAPI.updateProfile(updates, accessToken);
      set({ user: updatedUser });
    }
  }),
  {
    name: 'keen-auth',
    partialize: (state) => ({
      user: state.user,
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      isAuthenticated: state.isAuthenticated
    })
  }
));
```

### WebSocket Integration

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  lastMessage: any;
  connectionId: string | null;
}

export function useWebSocket(sessionFilters: string[] = []) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    lastMessage: null,
    connectionId: null
  });
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const eventHandlers = useRef<Map<string, Function[]>>(new Map());
  
  const connect = useCallback(() => {
    if (!accessToken || state.connecting || state.connected) return;
    
    setState(prev => ({ ...prev, connecting: true, error: null }));
    
    const wsUrl = buildWebSocketURL(accessToken, sessionFilters);
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      setState(prev => ({ 
        ...prev, 
        connected: true, 
        connecting: false,
        error: null 
      }));
    };
    
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      setState(prev => ({ ...prev, lastMessage: message }));
      
      // Handle connection establishment
      if (message.event_type === 'connection_established') {
        setState(prev => ({ 
          ...prev, 
          connectionId: message.data.connectionId 
        }));
      }
      
      // Trigger event handlers
      const handlers = eventHandlers.current.get(message.event_type);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error('WebSocket event handler error:', error);
          }
        });
      }
    };
    
    ws.current.onclose = (event) => {
      setState(prev => ({ 
        ...prev, 
        connected: false, 
        connecting: false,
        connectionId: null 
      }));
      
      // Attempt reconnection if not intentional close
      if (event.code !== 1000) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      }
    };
    
    ws.current.onerror = (error) => {
      setState(prev => ({ 
        ...prev, 
        error: 'WebSocket connection error',
        connecting: false 
      }));
    };
  }, [accessToken, sessionFilters, state.connecting, state.connected]);
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (ws.current) {
      ws.current.close(1000, 'User initiated');
      ws.current = null;
    }
    
    setState({
      connected: false,
      connecting: false,
      error: null,
      lastMessage: null,
      connectionId: null
    });
  }, []);
  
  const on = useCallback((eventType: string, handler: Function) => {
    if (!eventHandlers.current.has(eventType)) {
      eventHandlers.current.set(eventType, []);
    }
    eventHandlers.current.get(eventType)!.push(handler);
    
    // Return cleanup function
    return () => {
      const handlers = eventHandlers.current.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }, []);
  
  // Auto-connect when token is available
  useEffect(() => {
    if (accessToken && !state.connected && !state.connecting) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [accessToken, connect, disconnect]);
  
  return {
    ...state,
    connect,
    disconnect,
    on
  };
}
```

### Real-time Agent Tree Visualization

```typescript
// components/agents/AgentTreeVisualization.tsx
import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ConnectionMode
} from 'react-flow-renderer';
import { useWebSocket } from '@/hooks/useWebSocket';
import { AgentNode } from './AgentNode';
import { AgentTreeData } from '@/types/agent';

const nodeTypes = {
  agent: AgentNode
};

interface AgentTreeVisualizationProps {
  sessionId: string;
  className?: string;
}

export function AgentTreeVisualization({ 
  sessionId, 
  className = '' 
}: AgentTreeVisualizationProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  
  const { connected, on } = useWebSocket([sessionId]);
  
  // Convert agent tree data to React Flow format
  const convertToFlowData = useCallback((treeData: AgentTreeData) => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    
    const processNode = (
      nodeData: any, 
      x: number, 
      y: number, 
      parentId?: string
    ) => {
      const nodeId = nodeData.session_id;
      
      // Create node
      flowNodes.push({
        id: nodeId,
        type: 'agent',
        position: { x, y },
        data: {
          sessionId: nodeData.session_id,
          purpose: nodeData.purpose,
          status: nodeData.status,
          currentPhase: nodeData.current_phase,
          progress: nodeData.progress,
          gitBranch: nodeData.git_branch,
          metrics: nodeData.metrics,
          gitInfo: nodeData.git_info,
          onSelect: () => setSelectedNode(nodeId)
        },
        className: getNodeClassName(nodeData.status),
        selected: selectedNode === nodeId
      });
      
      // Create edge to parent
      if (parentId) {
        flowEdges.push({
          id: `${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          type: 'smoothstep',
          animated: nodeData.status === 'running',
          style: {
            stroke: getEdgeColor(nodeData.status),
            strokeWidth: 2
          },
          markerEnd: {
            type: 'arrowclosed',
            color: getEdgeColor(nodeData.status)
          }
        });
      }
      
      // Process children
      if (nodeData.children && nodeData.children.length > 0) {
        const childSpacing = Math.max(300, 800 / nodeData.children.length);
        const startX = x - (childSpacing * (nodeData.children.length - 1)) / 2;
        
        nodeData.children.forEach((child: any, index: number) => {
          processNode(
            child,
            startX + (childSpacing * index),
            y + 200,
            nodeId
          );
        });
      }
    };
    
    processNode(treeData, 400, 50);
    
    return { nodes: flowNodes, edges: flowEdges };
  }, [selectedNode]);
  
  // Handle real-time agent tree updates
  useEffect(() => {
    const unsubscribe = on('agent_tree_update', (event: any) => {
      if (event.session_id === sessionId) {
        const { nodes: newNodes, edges: newEdges } = convertToFlowData(
          event.data.full_tree
        );
        
        setNodes(newNodes);
        setEdges(newEdges);
      }
    });
    
    return unsubscribe;
  }, [sessionId, on, convertToFlowData, setNodes, setEdges]);
  
  // Handle agent spawning events
  useEffect(() => {
    const unsubscribe = on('agent_spawned', (event: any) => {
      if (event.session_id === sessionId || 
          event.data.parent_session === sessionId) {
        // Trigger tree refresh
        // In real implementation, you might update incrementally
      }
    });
    
    return unsubscribe;
  }, [sessionId, on]);
  
  const getNodeClassName = (status: string): string => {
    const baseClass = 'agent-node';
    return `${baseClass} ${baseClass}--${status}`;
  };
  
  const getEdgeColor = (status: string): string => {
    switch (status) {
      case 'running': return '#10B981'; // green
      case 'completed': return '#3B82F6'; // blue
      case 'failed': return '#EF4444'; // red
      case 'spawning': return '#F59E0B'; // yellow
      default: return '#6B7280'; // gray
    }
  };
  
  if (!connected) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Connecting to agent stream...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`h-full w-full ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.1 }}
      >
        <Background color="#e5e7eb" gap={16} />
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.data?.status) {
              case 'running': return '#10B981';
              case 'completed': return '#3B82F6';
              case 'failed': return '#EF4444';
              default: return '#6B7280';
            }
          }}
        />
      </ReactFlow>
      
      {selectedNode && (
        <AgentDetailsPanel 
          sessionId={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
```

### Agent Node Component

```typescript
// components/agents/AgentNode.tsx
import React from 'react';
import { Handle, Position, NodeProps } from 'react-flow-renderer';
import { 
  PlayIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon,
  CodeBracketIcon,
  GitBranchIcon
} from '@heroicons/react/24/outline';
import { formatDuration, formatCurrency } from '@/utils/formatters';

interface AgentNodeData {
  sessionId: string;
  purpose: string;
  status: 'spawning' | 'running' | 'completed' | 'failed';
  currentPhase: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  progress: number;
  gitBranch: string;
  metrics: {
    start_time: string;
    tokens_used: number;
    cost_so_far: number;
    files_created: number;
    files_modified: number;
    git_commits: number;
  };
  gitInfo: {
    branch: string;
    latest_commit: any;
    commits_count: number;
  };
  onSelect: () => void;
}

export function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  const getStatusIcon = () => {
    switch (data.status) {
      case 'running':
        return <PlayIcon className="h-4 w-4 text-green-600" />;
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4 text-blue-600" />;
      case 'failed':
        return <XCircleIcon className="h-4 w-4 text-red-600" />;
      default:
        return <ClockIcon className="h-4 w-4 text-yellow-600" />;
    }
  };
  
  const getStatusColor = () => {
    switch (data.status) {
      case 'running': return 'border-green-500 bg-green-50';
      case 'completed': return 'border-blue-500 bg-blue-50';
      case 'failed': return 'border-red-500 bg-red-50';
      default: return 'border-yellow-500 bg-yellow-50';
    }
  };
  
  const getPhaseColor = () => {
    switch (data.currentPhase) {
      case 'EXPLORE': return 'bg-indigo-100 text-indigo-800';
      case 'PLAN': return 'bg-purple-100 text-purple-800';
      case 'SUMMON': return 'bg-orange-100 text-orange-800';
      case 'COMPLETE': return 'bg-green-100 text-green-800';
    }
  };
  
  return (
    <>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      
      <div 
        className={`
          relative px-4 py-3 rounded-lg border-2 bg-white shadow-lg min-w-64 max-w-80
          ${getStatusColor()}
          ${selected ? 'ring-2 ring-indigo-500' : ''}
          cursor-pointer hover:shadow-xl transition-shadow
        `}
        onClick={data.onSelect}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span className="font-medium text-sm truncate">{data.purpose}</span>
          </div>
          <span className={`px-2 py-1 text-xs rounded-full font-medium ${getPhaseColor()}`}>
            {data.currentPhase}
          </span>
        </div>
        
        {/* Progress Bar */}
        {data.status === 'running' && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Progress</span>
              <span>{Math.round(data.progress * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${data.progress * 100}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {/* Metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
          <div className="flex items-center space-x-1">
            <GitBranchIcon className="h-3 w-3" />
            <span className="truncate">{data.gitBranch}</span>
          </div>
          <div className="flex items-center space-x-1">
            <CodeBracketIcon className="h-3 w-3" />
            <span>{data.metrics.files_created + data.metrics.files_modified} files</span>
          </div>
          <div>
            <span>{formatCurrency(data.metrics.cost_so_far)}</span>
          </div>
          <div>
            <span>{formatDuration(Date.now() - new Date(data.metrics.start_time).getTime())}</span>
          </div>
        </div>
        
        {/* Git commits indicator */}
        {data.gitInfo.commits_count > 0 && (
          <div className="absolute -top-2 -right-2">
            <div className="bg-indigo-600 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center">
              {data.gitInfo.commits_count}
            </div>
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </>
  );
}
```

### Credit Management Dashboard

```typescript
// components/credits/CreditDashboard.tsx
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  CreditCardIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { creditAPI } from '@/services/api';
import { formatCurrency } from '@/utils/formatters';
import { CreditPurchaseModal } from './CreditPurchaseModal';
import { UsageChart } from './UsageChart';

export function CreditDashboard() {
  const queryClient = useQueryClient();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  
  // Fetch credit balance
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: creditAPI.getBalance,
    refetchInterval: 30000 // Refresh every 30 seconds
  });
  
  // Fetch usage history
  const { data: usage } = useQuery({
    queryKey: ['credits', 'usage', '30d'],
    queryFn: () => creditAPI.getUsageHistory({ days: 30 }),
    enabled: !!balance
  });
  
  // Purchase credits mutation
  const purchaseMutation = useMutation({
    mutationFn: creditAPI.purchaseCredits,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      setShowPurchaseModal(false);
    }
  });
  
  if (balanceLoading) {
    return <div className="animate-pulse">Loading credit information...</div>;
  }
  
  const isLowBalance = balance && balance.current_balance < balance.auto_recharge_threshold;
  
  return (
    <div className="space-y-6">
      {/* Balance Overview */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Credit Balance</h2>
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Purchase Credits
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Current Balance */}
          <div className="text-center">
            <div className={`text-3xl font-bold ${
              isLowBalance ? 'text-red-600' : 'text-green-600'
            }`}>
              {formatCurrency(balance?.current_balance || 0)}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Available Balance
              {isLowBalance && (
                <ExclamationTriangleIcon className="h-4 w-4 text-red-500 inline ml-1" />
              )}
            </div>
          </div>
          
          {/* Reserved Balance */}
          <div className="text-center">
            <div className="text-2xl font-semibold text-yellow-600">
              {formatCurrency(balance?.reserved_balance || 0)}
            </div>
            <div className="text-sm text-gray-600 mt-1">Reserved for Active Sessions</div>
          </div>
          
          {/* Daily Usage */}
          <div className="text-center">
            <div className="text-2xl font-semibold text-blue-600">
              {formatCurrency(balance?.daily_used || 0)}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Today's Usage
              {balance?.daily_limit && (
                <span className="block text-xs mt-1">
                  of {formatCurrency(balance.daily_limit)} limit
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Auto-recharge Status */}
        {balance?.auto_recharge_enabled && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg flex items-center space-x-2">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <span className="text-sm text-green-800">
              Auto-recharge enabled: {formatCurrency(balance.auto_recharge_amount)} when 
              balance drops below {formatCurrency(balance.auto_recharge_threshold)}
            </span>
          </div>
        )}
      </div>
      
      {/* Usage Analytics */}
      {usage && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <ChartBarIcon className="h-5 w-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Usage Analytics</h3>
          </div>
          
          <UsageChart data={usage} />
        </div>
      )}
      
      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h3>
        <TransactionHistory limit={10} />
      </div>
      
      {/* Purchase Modal */}
      {showPurchaseModal && (
        <CreditPurchaseModal
          onClose={() => setShowPurchaseModal(false)}
          onPurchase={(amount, paymentMethodId) => 
            purchaseMutation.mutate({ amount, paymentMethodId })
          }
          isLoading={purchaseMutation.isPending}
        />
      )}
    </div>
  );
}
```

## Testing Implementation

### Component Testing

```typescript
// components/agents/AgentTreeVisualization.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentTreeVisualization } from './AgentTreeVisualization';
import { useWebSocket } from '@/hooks/useWebSocket';

// Mock WebSocket hook
vi.mock('@/hooks/useWebSocket');

const mockUseWebSocket = vi.mocked(useWebSocket);

function renderWithProviders(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
}

describe('AgentTreeVisualization', () => {
  beforeEach(() => {
    mockUseWebSocket.mockReturnValue({
      connected: true,
      connecting: false,
      error: null,
      lastMessage: null,
      connectionId: 'conn123',
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn()
    });
  });
  
  test('displays loading state when not connected', () => {
    mockUseWebSocket.mockReturnValue({
      connected: false,
      connecting: true,
      error: null,
      lastMessage: null,
      connectionId: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn()
    });
    
    renderWithProviders(
      <AgentTreeVisualization sessionId="session123" />
    );
    
    expect(screen.getByText('Connecting to agent stream...')).toBeInTheDocument();
  });
  
  test('renders agent tree when connected', async () => {
    const mockOn = vi.fn();
    mockUseWebSocket.mockReturnValue({
      connected: true,
      connecting: false,
      error: null,
      lastMessage: null,
      connectionId: 'conn123',
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: mockOn
    });
    
    renderWithProviders(
      <AgentTreeVisualization sessionId="session123" />
    );
    
    // Verify WebSocket event listeners are set up
    expect(mockOn).toHaveBeenCalledWith('agent_tree_update', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('agent_spawned', expect.any(Function));
  });
  
  test('updates tree when receiving WebSocket events', async () => {
    const mockOn = vi.fn((eventType, handler) => {
      if (eventType === 'agent_tree_update') {
        // Simulate receiving a tree update
        setTimeout(() => {
          handler({
            session_id: 'session123',
            data: {
              full_tree: {
                session_id: 'session123',
                purpose: 'Main Agent',
                status: 'running',
                current_phase: 'EXPLORE',
                progress: 0.5,
                git_branch: 'main',
                children: []
              }
            }
          });
        }, 100);
      }
      return vi.fn(); // cleanup function
    });
    
    mockUseWebSocket.mockReturnValue({
      connected: true,
      connecting: false,
      error: null,
      lastMessage: null,
      connectionId: 'conn123',
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: mockOn
    });
    
    renderWithProviders(
      <AgentTreeVisualization sessionId="session123" />
    );
    
    await waitFor(() => {
      // Verify tree node is rendered
      // Note: This would require more sophisticated mocking of react-flow-renderer
    });
  });
});
```

### E2E Testing

```typescript
// e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test';

test.describe('keen Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid=email-input]', 'test@example.com');
    await page.fill('[data-testid=password-input]', 'password123');
    await page.click('[data-testid=login-button]');
    await page.waitForURL('/dashboard');
  });
  
  test('displays dashboard with agent sessions', async ({ page }) => {
    // Verify dashboard loads
    await expect(page.locator('[data-testid=dashboard-title]')).toContainText('Dashboard');
    
    // Verify credit balance is displayed
    await expect(page.locator('[data-testid=credit-balance]')).toBeVisible();
    
    // Verify agent sessions section
    await expect(page.locator('[data-testid=agent-sessions]')).toBeVisible();
  });
  
  test('can start a new agent session', async ({ page }) => {
    // Click new agent button
    await page.click('[data-testid=new-agent-button]');
    
    // Fill in agent vision
    await page.fill(
      '[data-testid=agent-vision-input]',
      'Create a React todo application with TypeScript'
    );
    
    // Set options
    await page.check('[data-testid=enable-web-search]');
    await page.fill('[data-testid=max-cost-input]', '10.00');
    
    // Start agent
    await page.click('[data-testid=start-agent-button]');
    
    // Verify agent starts
    await expect(page.locator('[data-testid=agent-status]')).toContainText('EXPLORE');
    
    // Verify real-time updates
    await expect(page.locator('[data-testid=agent-tree]')).toBeVisible();
  });
  
  test('real-time agent tree updates', async ({ page }) => {
    // Start an agent session
    await startTestAgentSession(page);
    
    // Verify initial tree state
    await expect(page.locator('[data-testid=main-agent-node]')).toBeVisible();
    
    // Wait for agent to spawn children (in real test, this would be mocked)
    await page.waitForSelector('[data-testid=child-agent-node]', { timeout: 10000 });
    
    // Verify child nodes appear
    const childNodes = page.locator('[data-testid=child-agent-node]');
    await expect(childNodes).toHaveCount(1);
    
    // Verify git operations appear in activity feed
    await expect(page.locator('[data-testid=git-activity]')).toContainText('commit');
  });
  
  test('credit management functionality', async ({ page }) => {
    // Navigate to credits section
    await page.click('[data-testid=credits-nav]');
    
    // Verify credit balance display
    await expect(page.locator('[data-testid=current-balance]')).toBeVisible();
    
    // Test credit purchase flow
    await page.click('[data-testid=purchase-credits-button]');
    
    // Fill purchase form
    await page.fill('[data-testid=purchase-amount]', '50.00');
    await page.click('[data-testid=payment-method]');
    
    // Note: In real tests, you'd use Stripe test cards
    await page.fill('[data-testid=card-number]', '4242424242424242');
    await page.fill('[data-testid=card-expiry]', '12/25');
    await page.fill('[data-testid=card-cvc]', '123');
    
    await page.click('[data-testid=complete-purchase]');
    
    // Verify purchase success
    await expect(page.locator('[data-testid=purchase-success]')).toBeVisible();
    
    // Verify balance updated
    await expect(page.locator('[data-testid=current-balance]')).toContainText('$50.00');
  });
});
```

## Integration Points

**This Dashboard must integrate with:**
- **Phase 1 (Database)**: Query user data, sessions, and analytics
- **Phase 2 (API Gateway)**: Authentication and authorized API calls
- **Phase 3 (Agent Core)**: Display agent execution status and results
- **Phase 4 (WebSockets)**: Real-time updates and live visualization

## Deliverables

1. **Complete React application** with TypeScript and modern tooling
2. **Real-time agent tree visualization** with interactive exploration
3. **Authentication interface** with MFA and session management
4. **Credit management dashboard** with purchase and usage tracking
5. **Session management** with start, stop, and resume capabilities
6. **Git activity visualization** with commit history and branch tracking
7. **Responsive design** optimized for all device sizes
8. **Comprehensive test suite** with unit, integration, and E2E tests
9. **Performance optimization** with code splitting and caching
10. **Production deployment** with CDN, monitoring, and error tracking

**Remember:** The Dashboard is the face of keen - it's where users experience the magic of recursive autonomous agents. It must be beautiful, fast, reliable, and provide clear visibility into what agents are doing. Users should feel confident and in control while watching their autonomous development unfold in real-time.