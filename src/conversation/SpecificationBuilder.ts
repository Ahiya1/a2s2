import { RequirementItem } from "./DialogueManager";
import { ProjectContext } from "./ConversationAgent";
import { Logger } from "../logging/Logger";

/**
 * SpecificationBuilder converts dialogue requirements and project context
 * into a comprehensive specification for autonomous execution.
 */
export class SpecificationBuilder {
  constructor() {
    Logger.info("SpecificationBuilder initialized");
  }

  buildSpecification(
    requirements: RequirementItem[],
    projectContext: ProjectContext
  ): string {
    Logger.info("Building specification", {
      requirementsCount: requirements.length,
      techStack: projectContext.techStack,
    });

    const specification = this.constructSpecification(requirements, projectContext);

    Logger.info("Specification built", {
      specificationLength: specification.length,
    });

    return specification;
  }

  private constructSpecification(
    requirements: RequirementItem[],
    projectContext: ProjectContext
  ): string {
    const sections = [
      this.buildProjectOverview(requirements, projectContext),
      this.buildTechnicalRequirements(requirements, projectContext),
      this.buildImplementationDetails(requirements, projectContext),
      this.buildQualityRequirements(requirements),
      this.buildDeliveryRequirements(requirements),
    ];

    return sections.filter(section => section.trim().length > 0).join('\n\n');
  }

  private buildProjectOverview(
    requirements: RequirementItem[],
    projectContext: ProjectContext
  ): string {
    const mainGoal = requirements.find(r => r.category === 'main-goal');
    if (!mainGoal) return '';

    let overview = `PROJECT OVERVIEW:\n`;
    overview += `${mainGoal.details[0] || mainGoal.description}\n\n`;

    overview += `EXISTING PROJECT CONTEXT:\n`;
    overview += `- Directory: ${projectContext.directory}\n`;
    if (projectContext.techStack.length > 0) {
      overview += `- Technology Stack: ${projectContext.techStack.join(', ')}\n`;
    }
    if (projectContext.patterns.length > 0) {
      overview += `- Current Patterns: ${projectContext.patterns.join(', ')}\n`;
    }

    return overview;
  }

  private buildTechnicalRequirements(
    requirements: RequirementItem[],
    projectContext: ProjectContext
  ): string {
    let technical = 'TECHNICAL REQUIREMENTS:\n';

    // Database requirements
    const dbReq = requirements.find(r => r.category === 'database');
    if (dbReq) {
      technical += this.formatDatabaseRequirement(dbReq.details[0]);
    }

    // Authentication requirements
    const authReq = requirements.find(r => r.category === 'authentication');
    if (authReq) {
      technical += this.formatAuthenticationRequirement(authReq.details[0], projectContext);
    }

    // API requirements
    const apiReq = requirements.find(r => r.category === 'api-design');
    if (apiReq) {
      technical += this.formatAPIRequirement(apiReq.details[0]);
    }

    // Styling requirements
    const styleReq = requirements.find(r => r.category === 'styling');
    if (styleReq) {
      technical += this.formatStylingRequirement(styleReq.details[0], projectContext);
    }

    // Security requirements
    const securityReq = requirements.find(r => r.category === 'security');
    const apiSecurityReq = requirements.find(r => r.category === 'api-security');
    if (securityReq || apiSecurityReq) {
      technical += this.formatSecurityRequirements(securityReq, apiSecurityReq);
    }

    return technical.length > 'TECHNICAL REQUIREMENTS:\n'.length ? technical : '';
  }

  private buildImplementationDetails(
    requirements: RequirementItem[],
    projectContext: ProjectContext
  ): string {
    let implementation = 'IMPLEMENTATION DETAILS:\n';

    // User management details
    const userMgmtReq = requirements.find(r => r.category === 'user-management');
    if (userMgmtReq) {
      implementation += `- User Management: ${userMgmtReq.details[0]}\n`;
    }

    // Data validation details
    const validationReq = requirements.find(r => r.category === 'data-validation');
    if (validationReq) {
      implementation += `- Data Validation: ${validationReq.details[0]}\n`;
    }

    // Responsive design details
    const responsiveReq = requirements.find(r => r.category === 'responsive-design');
    if (responsiveReq) {
      implementation += `- Responsive Design: ${responsiveReq.details[0]}\n`;
    }

    // Performance requirements
    const performanceReq = requirements.find(r => r.category === 'performance');
    if (performanceReq && performanceReq.details[0]) {
      implementation += `- Performance: ${performanceReq.details[0]}\n`;
    }

    // Error handling
    const errorHandlingReq = requirements.find(r => r.category === 'error-handling');
    if (errorHandlingReq && errorHandlingReq.details[0].toLowerCase() === 'yes') {
      implementation += '- Include comprehensive error handling and logging\n';
    }

    // Additional requirements
    const additionalReq = requirements.find(r => r.category === 'additional');
    if (additionalReq) {
      implementation += `- Additional: ${additionalReq.details[0]}\n`;
    }

    // Integration with existing patterns
    implementation += this.buildIntegrationGuidelines(projectContext);

    return implementation.length > 'IMPLEMENTATION DETAILS:\n'.length ? implementation : '';
  }

  private buildQualityRequirements(requirements: RequirementItem[]): string {
    let quality = 'QUALITY REQUIREMENTS:\n';

    // Testing requirements
    const testingReq = requirements.find(r => r.category === 'testing');
    if (testingReq) {
      quality += this.formatTestingRequirement(testingReq.details[0]);
    }

    // Documentation requirements
    const docsReq = requirements.find(r => r.category === 'documentation');
    if (docsReq && docsReq.details[0].toLowerCase() !== 'no') {
      quality += `- Documentation: ${docsReq.details[0] === 'yes' ? 'Comprehensive' : docsReq.details[0]}\n`;
    }

    // Code quality standards
    quality += '- Follow existing code patterns and conventions\n';
    quality += '- Use TypeScript where applicable\n';
    quality += '- Include proper error handling\n';

    return quality;
  }

  private buildDeliveryRequirements(requirements: RequirementItem[]): string {
    let delivery = 'DELIVERY REQUIREMENTS:\n';

    // Deployment requirements
    const deployReq = requirements.find(r => r.category === 'deployment');
    if (deployReq) {
      delivery += this.formatDeploymentRequirement(deployReq.details[0]);
    }

    delivery += '- Ensure all changes are backwards compatible\n';
    delivery += '- Provide clear commit messages\n';
    delivery += '- Test functionality before completion\n';

    return delivery;
  }

  private formatDatabaseRequirement(dbChoice: string): string {
    const choice = dbChoice.toLowerCase();
    if (choice.includes('sqlite') || choice.includes('1')) {
      return '- Database: Set up SQLite with proper schema and migrations\n';
    }
    if (choice.includes('postgresql') || choice.includes('postgres') || choice.includes('2')) {
      return '- Database: Configure PostgreSQL with connection pooling and migrations\n';
    }
    if (choice.includes('mongodb') || choice.includes('3')) {
      return '- Database: Set up MongoDB with Mongoose ODM and proper schemas\n';
    }
    return `- Database: ${dbChoice}\n`;
  }

  private formatAuthenticationRequirement(authChoice: string, context: ProjectContext): string {
    const choice = authChoice.toLowerCase();
    let auth = '';
    
    if (choice.includes('email') || choice.includes('password') || choice.includes('1')) {
      auth += '- Authentication: Email/password system with JWT tokens\n';
      auth += '- Include password hashing (bcrypt) and validation\n';
    }
    if (choice.includes('social') || choice.includes('google') || choice.includes('github') || choice.includes('2')) {
      auth += '- Authentication: Social login (Google, GitHub) with OAuth2\n';
    }
    if (choice.includes('both') || choice.includes('3')) {
      auth += '- Authentication: Complete system with email/password + social login\n';
      auth += '- Include password hashing (bcrypt) and OAuth2 integration\n';
    }
    
    if (context.techStack.includes('Next.js')) {
      auth += '- Use NextAuth.js for authentication implementation\n';
    } else if (context.techStack.includes('Express')) {
      auth += '- Use Passport.js or similar for Express authentication\n';
    }
    
    return auth;
  }

  private formatAPIRequirement(apiOps: string): string {
    let api = '- API Design: RESTful endpoints with proper HTTP methods\n';
    
    if (apiOps.toLowerCase().includes('crud') || 
        (apiOps.includes('GET') && apiOps.includes('POST'))) {
      api += '- Include full CRUD operations (GET, POST, PUT, DELETE)\n';
    } else {
      api += `- API Operations: ${apiOps}\n`;
    }
    
    api += '- Implement proper request/response validation\n';
    api += '- Include appropriate HTTP status codes\n';
    
    return api;
  }

  private formatStylingRequirement(styleChoice: string, context: ProjectContext): string {
    const choice = styleChoice.toLowerCase();
    
    if (choice.includes('tailwind') || choice.includes('1')) {
      return '- Styling: Use Tailwind CSS for responsive, utility-first design\n';
    }
    if (choice.includes('material') || choice.includes('mui') || choice.includes('2')) {
      return '- Styling: Implement Material-UI components for consistent design\n';
    }
    if (choice.includes('custom') || choice.includes('3')) {
      return '- Styling: Create custom CSS with modern best practices\n';
    }
    if (choice.includes('existing') || choice.includes('4')) {
      return '- Styling: Follow existing CSS patterns and conventions\n';
    }
    
    return `- Styling: ${styleChoice}\n`;
  }

  private formatSecurityRequirements(
    securityReq?: RequirementItem,
    apiSecurityReq?: RequirementItem
  ): string {
    let security = '';
    
    if (securityReq && securityReq.details[0]) {
      security += `- Security: ${securityReq.details[0]}\n`;
    }
    
    if (apiSecurityReq && apiSecurityReq.details[0].toLowerCase() !== 'no') {
      security += '- API Security: Implement authentication middleware and rate limiting\n';
    }
    
    if (security === '') {
      security = '- Security: Implement basic security best practices\n';
    }
    
    return security;
  }

  private formatTestingRequirement(testChoice: string): string {
    const choice = testChoice.toLowerCase();
    
    if (choice.includes('none') || choice.includes('1')) {
      return '';
    }
    if (choice.includes('basic') || choice.includes('2')) {
      return '- Testing: Add basic unit tests for core functionality\n';
    }
    if (choice.includes('full') || choice.includes('coverage') || choice.includes('3')) {
      return '- Testing: Implement comprehensive test coverage with unit and integration tests\n';
    }
    
    return `- Testing: ${testChoice}\n`;
  }

  private formatDeploymentRequirement(deployChoice: string): string {
    const choice = deployChoice.toLowerCase();
    
    if (choice.includes('local') || choice.includes('development') || choice.includes('1')) {
      return '- Deployment: Optimize for local development environment\n';
    }
    if (choice.includes('vercel') || choice.includes('netlify') || choice.includes('2')) {
      return '- Deployment: Prepare for Vercel/Netlify deployment with proper build configuration\n';
    }
    if (choice.includes('aws') || choice.includes('gcp') || choice.includes('cloud') || choice.includes('3')) {
      return '- Deployment: Configure for cloud deployment (AWS/GCP) with proper environment setup\n';
    }
    if (choice.includes('docker') || choice.includes('container') || choice.includes('4')) {
      return '- Deployment: Create Docker configuration for containerized deployment\n';
    }
    
    return `- Deployment: ${deployChoice}\n`;
  }

  private buildIntegrationGuidelines(context: ProjectContext): string {
    let integration = '';
    
    if (context.techStack.length > 0) {
      integration += `- Follow ${context.techStack.join(' + ')} best practices\n`;
    }
    
    if (context.patterns.includes('React Application')) {
      integration += '- Use React hooks and functional components\n';
      integration += '- Follow React component composition patterns\n';
    }
    
    if (context.patterns.includes('Express Server')) {
      integration += '- Follow Express.js middleware patterns\n';
      integration += '- Implement proper route organization\n';
    }
    
    if (context.patterns.includes('REST API')) {
      integration += '- Maintain API consistency with existing endpoints\n';
    }
    
    if (context.techStack.includes('TypeScript')) {
      integration += '- Use TypeScript types and interfaces throughout\n';
    }
    
    return integration;
  }
}
