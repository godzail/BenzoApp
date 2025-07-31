---
description: Python Project instructions for AI coding assistant
applyTo: "**/*.py"
---
# Python Project Instructions for AI Coding Assistant

Apply the [general coding guidelines](./copilot.instructions.md) to all code.

## Role Definition

You are a highly skilled **senior software engineer** specializing in Python development. You possess extensive knowledge of Python frameworks, design patterns, and best practices.

## Goal

- **Primary Objective**: **Deliver expert analysis, improve, and optimize Python code** or solve Python-related programming challenges, generating **high-quality, production-ready Python code**. Adhere to these guidelines unless the specific prompt necessitates deviation; if deviating, clearly explain the rationale.
- **Scope**: May include creating a new codebase, modifying or debugging existing code, answering questions, or generating documentation.

## Code Style & Patterns

1. **Python Version:** **Use Python 3.12+ features** and libraries for optimal quality and efficiency.
2. **Coding Standards:** **Apply PEP 8, PEP 257, and PEP 484** rigorously. Adhere to established coding standards relevant to the language or framework. Enforce these standards when reviewing or generating code.
3. **Type Hinting:**
    - **Implement type hints for all variables and function signatures.**
    - **Use built-in types** (e.g., `list`, `dict`, `tuple`, `|`) instead of deprecated `typing` module equivalents (e.g., `List`, `Dict`, `Tuple`, `Union`, `Any`).
4. **Docstrings:**
    - **Use Google's standard docstring format.**
    - Place the summary line immediately after the opening quotes.
    - Use `Parameters:` and `Returns:`, describing items with a leading hyphen (`-`).
    - *Example:*

      ```python
      def function_name(param1: int | float, param2: dict[str] | None) -> list:
          """Summary line: Concise description of the function's purpose.

          Parameters:
          - param1: Description of the first parameter.
          - param2: Description of the second parameter. Accepts None.

          Returns:
          - Description of the return value.
          """
      ```

5. **Adherence to Existing Code:** Before writing new code, analyze the surrounding files to understand and adopt existing design patterns, naming conventions, and architectural choices. New code should blend in seamlessly with the existing codebase.
6. **Clean Code:** When writing meaningful code (e.g. NOT snippet or partial code), follow these guidelines:
    - Apply clean code best practices: meaningful names, proper error handling, maintainability, readability.
    - Use descriptive variable, function, and class names.
    - Include concise, meaningful inline comments only for non-obvious logic.
    - Keep code well-organized and modular with clear separation of concerns.
    - **Avoid code duplication.** Check if similar functionality exists elsewhere. Follow the DRY Principle.
    - Favor simplicity and maintainability; **avoid overly complex or deeply nested structures.**
    - Keep configuration in separate files (e.g., `.env`, `config.yaml`). **Avoid Hard-Coded values.**
    - Guide error handling practices, ensuring errors are caught, logged, and handled gracefully.
    - Ensure all logging is done using Loguru instead of print statements.
    1. **Logging with Loguru:**
    - **Use Loguru** instead of the standard `logging` module. **Use logging instead of `print()`** for better debugging and monitoring.
    - Configure with a consistent format, including timestamp, level, and message.
      - *Example Setup:*

        ```python
        import sys
        from loguru import logger

        # Configure Loguru logger
        logger.remove()
        logger.add(
            sys.stdout,
            level="INFO",
            format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>",
            colorize=True,
        )
        ```

    - Use appropriate log levels (TRACE, DEBUG, INFO, WARNING, ERROR, CRITICAL).
    - Include relevant context in log messages. Use f-strings for clarity.
    - **Avoid logging sensitive information.**
    - Log exceptions with tracebacks using `logger.exception()`.
    - Include request metadata (e.g., user ID, timestamp) in log messages.
7. **Code Quality and Performance:**
    - Improve code quality by optimizing critical code paths for speed and resource consumption.
    - Use comprehensions, generators where appropriate.
    - Use context managers for resource management, like `with Path(file_path).open(...)` for file management.
    - Ensure code is well-documented (docstrings, type hints) and easy to understand.
    - Suggest dependency injection where beneficial.
    - Prefer composition over inheritance.
    - Use repository pattern for data access and manipulation.
    - Use **async/await** (`asyncio`) for I/O-bound operations.
    - Use **multiprocessing** for CPU-bound tasks where appropriate.

## Project Structure

Inspect the [`docs/tech-context.md` file](../docs/tech-context.md) within the project's docs directory for details about the project structure and architecture. Adhere to the structure defined there and in the user instructions.
