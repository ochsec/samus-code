# Samus Code

![Samus Code Screenshot](./docs/assets/samus-screenshot.png)

Samus Code is a command-line AI workflow tool adapted from [**Qwen Code**](https://github.com/QwenLM/qwen-code) (Please refer to [this document](./README.gemini.md) for more details), optimized for working with local LLM models with enhanced parser support & tool support.

## Key Features

- **Code Understanding & Editing** - Query and edit large codebases beyond traditional context window limits
- **Workflow Automation** - Automate operational tasks like handling pull requests and complex rebases
- **Enhanced Parser** - Adapted parser specifically optimized for Samus-Coder models

## Quick Start

### Prerequisites

Ensure you have [Node.js version 20](https://nodejs.org/en/download) or higher installed.

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### Installation

```bash
git clone https://github.com/ochsec/samus-code.git
cd samus-code
npm install
npm install -g .
```

Then run from anywhere:

```bash
samus
```

### API Configuration

The tool supports multiple authentication methods and local LLM servers. Below are the configurations for each:

#### **1. Local LLM Servers (Ollama / LM Studio)**
Both servers provide OpenAI-compatible APIs and require no API key. Configure them via environment variables or code.

---

#### **Ollama**
- **Base URL**: Default is `http://localhost:11434`.  
- **Model**: Default is `llama3`.  
- **Environment Variables**:
  ```bash
  export OLLAMA_BASE_URL="http://localhost:11434"
  export OLLAMA_MODEL="llama3"
  ```
- **Prerequisites**:
  - Run the Ollama server: `ollama serve`.
  - Verify server health: The code checks `/<baseUrl>/api/tags`.

---

#### **LM Studio**
- **Base URL**: Default is `http://localhost:1234`.  
- **Model**: Default is `local-model`.  
- **Environment Variables**:
  ```bash
  export LM_STUDIO_BASE_URL="http://localhost:1234"
  export LM_STUDIO_MODEL="local-model"
  ```
- **Prerequisites**:
  - Ensure the LM Studio server is running.
  - Verify server health: The code checks `/<baseUrl>/v1/models`.

---

#### **Key Notes**
- **No API Key Required**: Both servers use `apiKey: 'not-required'` in the config.
- **OpenAI Compatibility**: The base URL is adjusted to point to the server's OpenAI-compatible endpoint.
- **Model Listing**: Use `listModels()` to fetch available models from the local server.

## Usage Examples

### Explore Codebases

```sh
cd your-project/
samus
> Describe the main pieces of this system's architecture
```

### Code Development

```sh
> Refactor this function to improve readability and performance
```

### Automate Workflows

```sh
> Analyze git commits from the last 7 days, grouped by feature and team member
```

```sh
> Convert all images in this directory to PNG format
```

## Popular Tasks

### Understand New Codebases

```text
> What are the core business logic components?
> What security mechanisms are in place?
> How does the data flow work?
```

### Code Refactoring & Optimization

```text
> What parts of this module can be optimized?
> Help me refactor this class to follow better design patterns
> Add proper error handling and logging
```

### Documentation & Testing

```text
> Generate comprehensive JSDoc comments for this function
> Write unit tests for this component
> Create API documentation
```

## Benchmark Results

### Terminal-Bench

| Agent     | Model              | Accuracy |
| --------- | ------------------ | -------- |
| Samus Code | Samus3-Coder-480A35 | 37.5     |

## Project Structure

```
samus-code/
├── packages/           # Core packages
├── docs/              # Documentation
├── examples/          # Example code
└── tests/            # Test files
```

## Development & Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to learn how to contribute to the project.

## Troubleshooting

If you encounter issues, check the [troubleshooting guide](docs/troubleshooting.md).

## Acknowledgments

This project is based on [Google Gemini CLI](https://github.com/google-gemini/gemini-cli). We acknowledge and appreciate the excellent work of the Gemini CLI team. Our main contribution focuses on parser-level adaptations to better support Samus-Coder models.

## License

[LICENSE](./LICENSE)
