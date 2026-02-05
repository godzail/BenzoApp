## 📝 Description

<!-- Provide a brief description of the changes in this PR -->

### Related Issue(s)

<!-- Link to related issue(s) if applicable -->
Fixes #(issue number)
Relates to #(issue number)

## 🎯 Type of Change

<!-- Mark the relevant option with an 'x' -->

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🎨 Code style update (formatting, renaming)
- [ ] ♻️ Code refactoring (no functional changes)
- [ ] ⚡ Performance improvement
- [ ] ✅ Test update
- [ ] 🔧 Configuration change
- [ ] 🏗️ Infrastructure/build change

## 🧪 Testing

### Test Coverage

<!-- Describe the tests you added or updated -->

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

### Testing Steps

<!-- Describe how to test these changes -->

1. Run `uv run pytest tests/`
2. Start the application with `uv run __run_app.py`

3. Test the following scenarios
   -

   -

## ✅ Checklist

### Code Quality

- [ ] My code follows the project's code style guidelines
- [ ] I have run `ruff check . --fix` and resolved all issues
- [ ] I have run `ty check .` and resolved type errors
- [ ] I have run `biome check src/static --write` for frontend changes
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings

### Documentation

- [ ] I have updated the documentation (README, docstrings, etc.)
- [ ] I have added/updated relevant comments in the code
- [ ] I have updated the API documentation if endpoints changed

### Testing

- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] All tests pass: `uv run pytest tests/`
- [ ] Test coverage hasn't decreased

### Git

- [ ] My commits follow the conventional commits specification
- [ ] I have rebased my branch on the latest main
- [ ] I have resolved all merge conflicts

## 📸 Screenshots (if applicable)

<!-- Add screenshots to demonstrate UI changes -->

### Before

<!-- Screenshot of the UI before changes -->

### After

<!-- Screenshot of the UI after changes -->

## ⚠️ Breaking Changes

<!-- If this PR introduces breaking changes, describe them here -->

- [ ] This PR introduces breaking changes
- [ ] I have updated the CHANGELOG.md (if applicable)
- [ ] I have documented the migration path

### Migration Guide

<!-- If breaking changes exist, provide migration instructions -->

## 📊 Performance Impact

<!-- Describe any performance implications -->

- [ ] No performance impact
- [ ] Performance improved
- [ ] Performance impact analyzed and acceptable

## 🔐 Security Considerations

<!-- Note any security implications -->

- [ ] No security implications
- [ ] Security reviewed and approved
- [ ] I have not exposed any sensitive data (API keys, passwords, etc.)

## 📋 Additional Notes

<!-- Add any additional notes for reviewers -->

## 🙏 Reviewer Guidelines

<!-- Any specific areas you'd like reviewers to focus on? -->

Please review:

- [ ] Code logic and structure
- [ ] Test coverage
- [ ] Documentation accuracy
- [ ] Performance implications
