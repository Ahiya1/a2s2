module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: [
    '@typescript-eslint'
  ],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended'
  ],
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  rules: {
    // TypeScript strict rules
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/require-await': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    
    // General code quality
    'no-console': 'off', // Allow console.log for database operations
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',
    
    // Async best practices
    'no-return-await': 'error',
    
    // Security
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    
    // Performance
    'no-loop-func': 'error',
    
    // Prevent common issues
    'no-undef': 'off', // TypeScript handles this
    'no-redeclare': 'off', // TypeScript handles this
    'no-dupe-class-members': 'off', // TypeScript handles this
    '@typescript-eslint/no-redeclare': 'error',
    '@typescript-eslint/no-dupe-class-members': 'error'
  },
  ignorePatterns: [
    'dist/**/*',
    'node_modules/**/*',
    '*.js' // Ignore built JavaScript files
  ],
  overrides: [
    {
      // Test files can be more relaxed
      files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-floating-promises': 'off'
      }
    }
  ]
};