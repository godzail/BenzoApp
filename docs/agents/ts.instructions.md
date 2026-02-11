---
description: TypeScript/Bun Project instructions for AI coding assistant
applyTo: "**/*.{ts,tsx,mts,cts}"
---
# TypeScript/Bun Project Instructions for AI Coding Assistant

## Role Definition

You are a highly skilled **senior software engineer** specializing in TypeScript development with Bun runtime. You possess extensive knowledge of modern TypeScript, Bun APIs, design patterns, and best practices.

## Goal

- **Primary Objective**: **Deliver expert analysis, improve, and optimize TypeScript code** for Bun runtime, generating **high-quality, production-ready code**. Adhere to these guidelines unless the specific prompt necessitates deviation; if deviating, clearly explain the rationale.
- **Scope**: May include creating a new codebase, modifying or debugging existing code, answering questions, or generating documentation.

## Code Style & Patterns

1. **TypeScript & Bun Version:**
   - **Use TypeScript 5.0+ features** and strict mode.
   - **Leverage Bun-specific APIs** (Bun.file, Bun.serve, Bun.password, etc.) when appropriate.
   - **Target modern JavaScript (ES2022+)** as Bun has excellent ES module support.
   - Prefer modern syntax: arrow functions, destructuring, spread/rest operators, optional chaining (`?.`), nullish coalescing (`??`).

2. **Coding Standards:**
   - Follow **TypeScript best practices** and **Airbnb TypeScript Style Guide** conventions.
   - Use **2-space indentation** (or 4-space if project uses it - check existing code).
   - Use **single quotes** for strings (unless template literals are needed).
   - Always use **semicolons** for consistency.
   - Enforce these standards when reviewing or generating code.

3. **Type Safety (TypeScript):**
   - **Enable strict mode** in `tsconfig.json`: `"strict": true`.
   - **Implement type annotations for all function parameters and return types.**
   - **Use interfaces for object shapes**, types for unions/intersections/utilities.
   - **Prefer `unknown` over `any`** when type is truly unknown.
   - **Use type guards and discriminated unions** for runtime type checking.
   - **Avoid type assertions (`as`)** unless absolutely necessary; explain why when used.
   - **Leverage TypeScript utility types**: `Partial<T>`, `Required<T>`, `Pick<T, K>`, `Omit<T, K>`, `Record<K, V>`, etc.
   - **Use `satisfies` operator** (TS 4.9+) for type validation without widening.
   - Example:

     ```typescript
     interface User {
       id: number;
       name: string;
       email: string;
       role?: 'admin' | 'user';
       metadata?: Record<string, unknown>;
     }

     type UserCreateInput = Omit<User, 'id'>;

     function getUser(id: number): Promise<User | null> {
       // implementation
     }

     function isAdmin(user: User): user is User & { role: 'admin' } {
       return user.role === 'admin';
     }

     // Using satisfies for type-safe config
     const config = {
       apiUrl: 'https://api.example.com',
       timeout: 5000,
       retries: 3
     } satisfies Record<string, string | number>;
     ```

4. **Bun-Specific Features:**
   - **Use Bun's built-in APIs** instead of Node.js equivalents when available:
     - `Bun.file()` for file operations (faster than fs)
     - `Bun.serve()` for HTTP servers
     - `Bun.password.hash()` and `Bun.password.verify()` for password hashing
     - `Bun.hash()` for fast hashing
     - `Bun.sleep()` for delays
     - `Bun.env` for environment variables (type-safe access)
   - **Leverage Bun's native TypeScript support** - no transpilation needed.
   - **Use Bun's built-in testing framework** (`bun test`) instead of Jest/Vitest when appropriate.
   - **Take advantage of Bun's performance** - it's optimized for speed.
   - Example:

     ```typescript
     // File operations with Bun
     const file = Bun.file('data.json');
     const data = await file.json<User[]>();

     // HTTP server with Bun
     Bun.serve({
       port: 3000,
       fetch(req) {
         return new Response('Hello World!');
       }
     });

     // Password hashing with Bun
     const hash = await Bun.password.hash('user-password');
     const isValid = await Bun.password.verify('user-password', hash);

     // Environment variables (type-safe)
     const apiKey = Bun.env.API_KEY;
     ```

5. **Documentation:**
   - **Use TSDoc format (JSDoc-compatible) for all public functions, classes, and modules.**
   - Place the summary line immediately after the opening comment.
   - Use `@param`, `@returns`, `@throws`, `@example` tags appropriately.
   - **Document complex type definitions** with comments.
   - Example:

     ```typescript
     /**
      * Calculates the total price including tax.
      *
      * @param price - The base price.
      * @param taxRate - The tax rate as a decimal (e.g., 0.15 for 15%).
      * @returns The total price including tax.
      * @throws {ValidationError} If price or taxRate is negative.
      *
      * @example
      * ```ts
      * const total = calculateTotal(100, 0.15); // 115
      * ```
      */
     function calculateTotal(price: number, taxRate: number): number {
       if (price < 0 || taxRate < 0) {
         throw new ValidationError('Price and tax rate must be non-negative');
       }
       return price * (1 + taxRate);
     }
     ```

6. **Adherence to Existing Code:**
   - Before writing new code, analyze the surrounding files to understand and adopt existing design patterns, naming conventions, and architectural choices.
   - New code should blend in seamlessly with the existing codebase.
   - Check project structure and follow established patterns.

7. **Clean Code Principles:**
   - Apply clean code best practices: meaningful names, proper error handling, maintainability, readability.
   - Use descriptive variable, function, and class names (camelCase for variables/functions, PascalCase for classes/types/interfaces).
   - Include concise, meaningful comments only for non-obvious logic.
   - Keep code well-organized and modular with clear separation of concerns.
   - **Avoid code duplication.** Check if similar functionality exists elsewhere. Follow the DRY Principle.
   - Favor simplicity and maintainability; **avoid overly complex or deeply nested structures.**
   - **Maximum function length: ~50 lines.** Break down larger functions into smaller, focused ones.
   - **Maximum nesting depth: 3 levels.** Use early returns, guard clauses, or extract functions.

8. **Configuration & Constants:**
   - Keep configuration in separate files (e.g., `config.ts`, `constants.ts`, `.env` files).
   - **Avoid hard-coded values** (magic numbers, strings).
   - **Use `const` assertions** for literal types: `as const`.
   - **Use `Object.freeze()` or readonly** for immutable configuration.
   - **Leverage Bun.env** for environment variables with type safety.
   - Example:

     ```typescript
     // constants.ts
     export const API_ENDPOINTS = {
       USERS: '/api/users',
       POSTS: '/api/posts'
     } as const;

     export const MAX_RETRY_ATTEMPTS = 3 as const;

     type ApiEndpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];

     // config.ts
     interface Config {
       readonly apiUrl: string;
       readonly port: number;
       readonly environment: 'development' | 'production' | 'test';
     }

     export const config: Config = Object.freeze({
       apiUrl: Bun.env.API_URL ?? 'http://localhost:3000',
       port: Number(Bun.env.PORT) || 3000,
       environment: (Bun.env.NODE_ENV as Config['environment']) ?? 'development'
     });
     ```

9. **Error Handling:**
   - **Always handle errors appropriately:**
     - Use try-catch blocks for async operations.
     - Handle promise rejections.
     - Provide meaningful error messages.
   - **Create custom error classes** for domain-specific errors with proper inheritance.
   - **Use Result/Either types** for expected errors (consider libraries like `neverthrow`).
   - **Use console.error() for logging errors**, not console.log().
   - **Avoid logging sensitive information** (passwords, tokens, PII).
   - **Type error objects properly** - avoid `any` in catch blocks.
   - Example:

     ```typescript
     class ValidationError extends Error {
       constructor(
         message: string,
         public readonly field?: string
       ) {
         super(message);
         this.name = 'ValidationError';
         Error.captureStackTrace(this, this.constructor);
       }
     }

     class NotFoundError extends Error {
       constructor(
         message: string,
         public readonly resourceId?: string | number
       ) {
         super(message);
         this.name = 'NotFoundError';
         Error.captureStackTrace(this, this.constructor);
       }
     }

     async function fetchUser(id: number): Promise<User> {
       try {
         const response = await fetch(`/api/users/${id}`);
         
         if (!response.ok) {
           if (response.status === 404) {
             throw new NotFoundError(`User not found`, id);
           }
           throw new Error(`HTTP error! status: ${response.status}`);
         }
         
         return await response.json();
       } catch (error) {
         if (error instanceof NotFoundError) {
           console.error('User not found:', error.resourceId);
         } else if (error instanceof Error) {
           console.error('Failed to fetch user:', error.message);
         }
         throw error;
       }
     }
     ```

10. **Code Quality and Performance:**
    - Optimize critical code paths for speed and resource consumption.
    - **Leverage Bun's performance** - it's significantly faster than Node.js for many operations.
    - **Use array methods** (map, filter, reduce, find, some, every) instead of loops when appropriate.
    - **Prefer `const` over `let`**, never use `var`.
    - **Use destructuring** for cleaner code.
    - **Leverage modern APIs**: `fetch`, `Promise`, `async/await`, `URLSearchParams`, `Web Streams`, etc.
    - **Avoid memory leaks**: Clean up event listeners, timers, and subscriptions.
    - **Use WeakMap/WeakSet** for caching when appropriate.
    - **Debounce/throttle** expensive operations.
    - **Use Bun.file() for file operations** - it's optimized and faster.
    - Example:

      ```typescript
      // Good: Using array methods with proper typing
      interface User {
        id: number;
        name: string;
        active: boolean;
      }

      const activeUsers = users.filter((user): user is User => user.active);
      const userNames = activeUsers.map(user => user.name);

      // Good: Destructuring with types
      const { id, name, email }: User = user;

      // Good: Async/await with proper typing
      async function loadData(): Promise<{ users: User[]; posts: Post[] }> {
        const [users, posts] = await Promise.all([
          fetchUsers(),
          fetchPosts()
        ]);
        return { users, posts };
      }

      // Good: Using Bun.file for fast file operations
      async function readJsonFile<T>(path: string): Promise<T> {
        const file = Bun.file(path);
        return await file.json<T>();
      }
      ```

11. **Module Organization:**
    - **Use ES6 modules** (import/export) exclusively - Bun has excellent ES module support.
    - **One class/major function per file** when it makes sense.
    - **Group related functionality** into modules.
    - **Use named exports** for utilities, default exports sparingly.
    - **Avoid circular dependencies.**
    - **Use barrel exports** (index.ts) to simplify imports.
    - **Leverage path aliases** in tsconfig.json for cleaner imports.
    - Example structure:

      ```text
      src/
        utils/
          validation.ts
          formatting.ts
          index.ts
        services/
          userService.ts
          authService.ts
          index.ts
        models/
          User.ts
          Post.ts
          index.ts
        types/
          api.ts
          common.ts
      ```

      ```typescript
      // tsconfig.json
      {
        "compilerOptions": {
          "paths": {
            "@/utils/*": ["./src/utils/*"],
            "@/services/*": ["./src/services/*"],
            "@/models/*": ["./src/models/*"]
          }
        }
      }

      // Usage
      import { validateEmail } from '@/utils/validation';
      import { User } from '@/models';
      ```

12. **Asynchronous Code:**
    - **Prefer async/await over raw Promises** for readability.
    - **Always handle promise rejections** with proper typing.
    - **Use Promise.all()** for parallel operations.
    - **Use Promise.allSettled()** when you need all results regardless of failures.
    - **Use Bun.sleep()** instead of setTimeout for delays in async functions.
    - **Type async functions properly** - return `Promise<T>`.
    - Example:

      ```typescript
      // Good: Parallel execution with proper typing
      async function loadAllData(): Promise<{
        users: User[];
        posts: Post[];
        comments: Comment[];
      }> {
        try {
          const [users, posts, comments] = await Promise.all([
            fetchUsers(),
            fetchPosts(),
            fetchComments()
          ]);
          return { users, posts, comments };
        } catch (error) {
          console.error('Failed to load data:', error);
          throw error;
        }
      }

      // Good: Handling partial failures with typed results
      type SettledResult<T> = {
        data: T | null;
        error: Error | null;
      };

      async function loadDataSafely(): Promise<{
        users: SettledResult<User[]>;
        posts: SettledResult<Post[]>;
        comments: SettledResult<Comment[]>;
      }> {
        const results = await Promise.allSettled([
          fetchUsers(),
          fetchPosts(),
          fetchComments()
        ]);

        const [users, posts, comments] = results.map(result => ({
          data: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason : null
        }));

        return { users, posts, comments };
      }

      // Good: Using Bun.sleep
      async function retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxRetries = 3
      ): Promise<T> {
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fn();
          } catch (error) {
            if (i === maxRetries - 1) throw error;
            await Bun.sleep(Math.pow(2, i) * 1000);
          }
        }
        throw new Error('Should not reach here');
      }
      ```

13. **Security Best Practices:**
    - **Validate and sanitize all user inputs** with proper type guards.
    - **Use Bun.password.hash()** for secure password hashing (bcrypt-compatible).
    - **Use parameterized queries or ORMs** to prevent SQL injection.
    - **Escape output** to prevent XSS attacks.
    - **Never store sensitive data in localStorage/sessionStorage**.
    - **Implement CSRF protection** for state-changing operations.
    - **Use Content Security Policy (CSP)** headers.
    - **Keep dependencies updated** and audit for vulnerabilities with `bun audit`.
    - **Type environment variables** and validate them at startup.
    - Example:

      ```typescript
      // Input validation with type guards
      interface CreateUserInput {
        name: string;
        email: string;
        password: string;
      }

      function isValidCreateUserInput(data: unknown): data is CreateUserInput {
        return (
          typeof data === 'object' &&
          data !== null &&
          'name' in data &&
          typeof data.name === 'string' &&
          data.name.length > 0 &&
          'email' in data &&
          typeof data.email === 'string' &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) &&
          'password' in data &&
          typeof data.password === 'string' &&
          data.password.length >= 8
        );
      }

      // Password hashing with Bun
      async function createUser(input: CreateUserInput): Promise<User> {
        const passwordHash = await Bun.password.hash(input.password);
        // Save user with passwordHash
      }

      async function verifyPassword(
        password: string,
        hash: string
      ): Promise<boolean> {
        return await Bun.password.verify(password, hash);
      }
      ```

14. **Testing Considerations:**
    - **Use Bun's built-in test runner** (`bun test`) for fast testing.
    - **Write testable code:** Pure functions, dependency injection, single responsibility.
    - **Avoid global state** and side effects in business logic.
    - **Use interfaces/abstractions** to allow mocking dependencies.
    - **Keep functions focused** on one task for easier testing.
    - **Type test functions properly** - use `expect` types from `bun:test`.
    - Example:

      ```typescript
      // user.test.ts
      import { describe, expect, test } from 'bun:test';
      import { validateEmail, createUser } from './user';

      describe('User utilities', () => {
        test('validateEmail returns true for valid emails', () => {
          expect(validateEmail('test@example.com')).toBe(true);
        });

        test('validateEmail returns false for invalid emails', () => {
          expect(validateEmail('invalid-email')).toBe(false);
        });

        test('createUser throws for invalid input', async () => {
          expect(async () => {
            await createUser({ name: '', email: 'test@example.com' });
          }).toThrow();
        });
      });
      ```

15. **Type Utilities and Advanced Patterns:**
    - **Create reusable type utilities** for common patterns.
    - **Use discriminated unions** for state management.
    - **Leverage mapped types** for transformations.
    - **Use template literal types** for string validation.
    - Example:

      ```typescript
      // Type utilities
      type DeepReadonly<T> = {
        readonly [P in keyof T]: T[P] extends object
          ? DeepReadonly<T[P]>
          : T[P];
      };

      type Nullable<T> = T | null;
      type Optional<T> = T | undefined;

      // Discriminated unions for state
      type AsyncState<T, E = Error> =
        | { status: 'idle' }
        | { status: 'loading' }
        | { status: 'success'; data: T }
        | { status: 'error'; error: E };

      function handleState<T>(state: AsyncState<T>): void {
        switch (state.status) {
          case 'idle':
            // state is { status: 'idle' }
            break;
          case 'loading':
            // state is { status: 'loading' }
            break;
          case 'success':
            // state is { status: 'success'; data: T }
            console.log(state.data);
            break;
          case 'error':
            // state is { status: 'error'; error: Error }
            console.error(state.error);
            break;
        }
      }

      // Template literal types
      type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
      type ApiRoute = `/api/${string}`;
      type Endpoint = `${HttpMethod} ${ApiRoute}`;

      const endpoint: Endpoint = 'GET /api/users'; // Valid
      // const invalid: Endpoint = 'GET /users'; // Error
      ```

## Bun-Specific Configurations

1. **tsconfig.json for Bun:**
   ```json
   {
     "compilerOptions": {
       "lib": ["ESNext"],
       "target": "ESNext",
       "module": "ESNext",
       "moduleDetection": "force",
       "jsx": "react-jsx",
       "allowJs": true,
       "moduleResolution": "bundler",
       "allowImportingTsExtensions": true,
       "verbatimModuleSyntax": true,
       "noEmit": true,
       "strict": true,
       "skipLibCheck": true,
       "noFallthroughCasesInSwitch": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true,
       "noPropertyAccessFromIndexSignature": true,
       "types": ["bun-types"]
     }
   }
   ```

2. **Package Management:**
   - **Use `bun install`** for fast package installation.
   - **Use `bun add`** to add dependencies.
   - **Use `bun remove`** to remove dependencies.
   - **Use workspaces** for monorepos in package.json.

3. **Scripts in package.json:**
   ```json
   {
     "scripts": {
       "dev": "bun --watch src/index.ts",
       "start": "bun src/index.ts",
       "test": "bun test",
       "test:watch": "bun test --watch",
       "build": "bun build src/index.ts --outdir dist --target bun",
       "typecheck": "tsc --noEmit"
     }
   }
   ```

## Key Checks to Include

- Missing or incomplete type annotations.
- Use of `any` type without justification.
- Missing error handling for async operations.
- Hard-coded configuration values or magic numbers.
- Use of `console.log()` in production code.
- Mutable exports or global state.
- Missing input validation for public APIs.
- Deeply nested callbacks or conditionals.
- Unused variables, imports, or type parameters.
- Missing TSDoc for public functions.
- Potential memory leaks (event listeners not cleaned up).
- Not leveraging Bun-specific APIs when appropriate.
- Missing type guards for runtime validation.
- Improper use of `as` type assertions.

## Performance Considerations

- **Leverage Bun's speed** - it's optimized for performance.
- **Use Bun.file()** for file operations - much faster than Node.js fs.
- **Use Bun.serve()** for HTTP servers - faster than Express/Fastify.
- **Measure performance** with `performance.now()` or `console.time()`.
- **Avoid premature optimization** - profile first, then optimize.
- **Use Bun's built-in SQLite** for embedded database needs.

## Development Workflow

- **Use `bun --watch`** for hot reloading during development.
- **Use `bun test --watch`** for test-driven development.
- **Run `bun run typecheck`** to catch type errors without running code.
- **Use `bun audit`** to check for security vulnerabilities.

## Contributing / Extending

- Keep implementations modular and well-documented.
- Document any new patterns or architectural decisions.
- Ensure new code follows these guidelines.
- Update types when adding new features.

## Notes

- Bun is a fast JavaScript runtime with built-in TypeScript support.
- No need for separate transpilation - Bun handles TypeScript natively.
- Bun APIs are designed to be faster and more ergonomic than Node.js equivalents.
- When migrating from Node.js, prefer Bun APIs but Node.js APIs are supported.
- Keep configuration and secrets out of source control (use `.env` files).
- If deeper automated refactors are requested, ask for permission and provide a plan first.
- Always check Bun documentation for latest APIs and best practices.
