# Contributing to BenzoApp

Thank you for your interest in contributing to BenzoApp! This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Guidelines](#testing-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## 📜 Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and constructive in all interactions.

## 🚀 Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a new branch for your feature or bug fix
4. Make your changes following our guidelines
5. Test your changes thoroughly
6. Submit a pull request

## 🛠️ Development Setup

### Prerequisites

- Python 3.14 or higher
- [uv](https://github.com/astral-sh/uv) package manager

### Environment Setup

```bash
# Clone your fork
git clone https://github.com/yourusername/BenzoApp.git
cd BenzoApp

# Create virtual environment and install dependencies
uv sync

# Install development dependencies (included in sync)
# Dev dependencies: pytest, httpx, coverage tools, type checkers, etc.

# Copy environment template
cp .env.example .env

# Run the application
uv run __run_app.py
```

### Project Configuration

The project follows the guidelines specified in [AGENTS.md](AGENTS.md):

- **OS**: Windows (PowerShell)
- **Python**: 3.14+
- **Package Manager**: `uv`
- **Global Tools**: `ripgrep`, `ruff`, `ty`, `biome`

## 🎨 Code Style Guidelines

### Python Code

We use **ruff** for both linting and formatting Python code.

#### Linting & Formatting

```bash
# Check for issues
ruff check .

# Auto-fix issues
ruff check . --fix

# Configuration is in .ruff.toml
```

#### Type Checking

We use **ty** for type checking:

```bash
# Run type checker
ty check .

# Configuration is in .mypy.ini
```

#### Python Best Practices

- Follow **PEP 8** style guide
- Use **type hints** for all function signatures
- Write **docstrings** for modules, classes, and public functions
- Keep functions focused and single-purpose
- Follow the **role definition** in `agents.md` - act as a senior backend engineer
- Adhere to guidelines in `docs/agents/py.instructions.md` (if available)

### Frontend Code (JavaScript, HTML, CSS)

We use **biome** for linting and formatting:

```bash
# Check frontend code
biome check src/static

# Auto-fix issues
biome check src/static --write

# Configuration is in biome.json
```

#### Frontend Best Practices

- Use modern ES6+ JavaScript
- Follow accessibility best practices (ARIA labels, semantic HTML)
- Maintain responsive design principles
- Keep Alpine.js directives clean and readable
- Ensure i18n keys are added to both `en.json` and `it.json`

## 🧪 Testing Guidelines

### Running Tests

```bash
# Run all tests
uv run pytest tests/

# Run specific test file
uv run pytest tests/test_main.py

# Run with coverage
uv run pytest tests/ --cov=src --cov-report=html

# View coverage report
# Open coverage/index.html in browser
```

### Writing Tests

- Place tests in the `tests/` directory
- Name test files with `test_` prefix
- Use `pytest` fixtures for reusable test components
- Aim for high test coverage (>80%)
- Test both success and error cases
- Mock external API calls

### Test Configuration

- Configuration: `.pytest.ini`
- Coverage configuration: `.coverage`

## 📝 Commit Guidelines

### Commit Message Format

Follow the conventional commits specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependencies

#### Examples

```bash
feat(search): add support for LPG fuel type

fix(geocoding): handle cities with special characters

docs(readme): update installation instructions

test(api): add tests for search endpoint error cases
```

### Branch Naming

Use descriptive branch names:

```
feature/add-diesel-filter
fix/geocoding-timeout
docs/update-api-docs
refactor/extract-fuel-service
```

## 🔄 Pull Request Process

### Before Submitting

1. **Update your branch** with the latest main

   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run all checks**

   ```bash
   # Python linting
   ruff check .
   
   # Type checking
   ty check .
   
   # Frontend linting
   biome check src/static
   
   # Tests
   uv run pytest tests/
   ```

3. **Update documentation** if needed
   - Update README.md for user-facing changes
   - Add docstrings for new functions
   - Update API documentation if endpoints changed

### Pull Request Template

When creating a PR, please:

- Use the provided PR template (`.github/pull_request_template.md`)
- Provide a clear description of changes
- Reference related issues
- Include screenshots for UI changes
- Note any breaking changes
- Ensure all CI checks pass

### Review Process

1. At least one maintainer review is required
2. All automated checks must pass
3. Address review feedback promptly
4. Keep the PR focused on a single concern
5. Squash commits if requested before merging

## 🐛 Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) when opening issues:

- Describe the bug clearly
- Provide steps to reproduce
- Include environment details
- Add relevant logs or screenshots

## 💡 Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md):

- Describe the feature and use case
- Explain why it would be valuable
- Suggest a possible implementation
- Consider alternatives

## ❓ Questions?

If you have questions:

- Check existing [documentation](README.md)
- Search [existing issues](https://github.com/yourusername/BenzoApp/issues)
- Open a new issue with your question

## 🙏 Thank You

Your contributions help make BenzoApp better for everyone. We appreciate your time and effort!

---

**Note**: By contributing to BenzoApp, you agree that your contributions will be licensed under the MIT License.
