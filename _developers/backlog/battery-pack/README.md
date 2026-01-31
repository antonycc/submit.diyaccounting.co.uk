# Battery Pack 🔋

> Key-gated open source: your code is open, but batteries not included.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What Is This?

Battery Pack lets you keep your project **genuinely open source** while encrypting key components that require a private key to run.

```
Your public repo:
├── src/api.js           ← Readable, open source
├── src/utils.js         ← Readable, open source
├── src/core.impl.js.enc ← Encrypted blob (open source, but won't run)
└── battery-pack.pub     ← Public key (anyone can encrypt more files)
```

**Competitors can:**
- ✅ Read your code
- ✅ Fork your repo
- ✅ Learn from your implementation
- ❌ Run your code without the key
- ❌ Deploy a competing service without re-implementing encrypted modules

## Why?

You want transparency (auditing, trust, community) but also protection from lift-and-shift cloning.

Traditional options force a choice:
- **Proprietary**: Protected, but not transparent
- **Open source**: Transparent, but anyone can compete
- **Source-available** (BSL, FSL): Visible but legally restricted

**Key-gated open source** is a fourth option: genuinely open source, but practically requires re-implementation to compete.

## Quick Start

```bash
# Install (or copy app/lib/battery-pack/ into your project)
npm install battery-pack

# Generate keypair
npx battery-pack keygen
# Creates: battery-pack.pub (commit this)
#          battery-pack.key (keep secret!)

# Encrypt a module
npx battery-pack encrypt src/core.impl.js
# Creates: src/core.impl.js.enc

# In your code
import { loadProtectedModuleSync } from 'battery-pack';
const core = loadProtectedModuleSync('./src/core.impl.js.enc');
```

## Integration Pattern

Create a thin wrapper that loads the encrypted implementation:

```javascript
// src/core.js (committed, readable)
import { loadProtectedModuleSync } from 'battery-pack';

const impl = loadProtectedModuleSync(
  new URL('./core.impl.js.enc', import.meta.url)
);

export const { processData, validateInput } = impl;
```

Your existing code doesn't change:

```javascript
// src/handler.js (unchanged)
import { processData } from './core.js';
// Just works — if you have the key
```

## Development Workflow

**One-time setup per workstation:**
```bash
# Get the key from your team (password manager, secure share, etc.)
cp ~/secrets/battery-pack.key .
```

**Daily development:**
```bash
npm test  # Just works
npm start # Just works
```

**CI:**
```yaml
env:
  BATTERY_PACK_PRIVATE_KEY: ${{ secrets.BATTERY_PACK_PRIVATE_KEY }}
```

## Private Key Sources

The loader checks these in order:

| Source | Use Case |
|--------|----------|
| `BATTERY_PACK_PRIVATE_KEY` env | CI (base64-encoded) |
| `BATTERY_PACK_PRIVATE_KEY_FILE` env | Custom key location |
| `./battery-pack.key` file | Local development |
| `BATTERY_PACK_PRIVATE_KEY_ARN` env | AWS Secrets Manager (async only) |

## API

```javascript
import {
  // Encryption
  generateKeypair,
  encrypt,
  decrypt,
  encryptFile,
  decryptFile,
  validateKeypair,

  // Loading
  loadProtectedModuleSync,  // Recommended for dev
  loadProtectedModule,      // Async, for AWS Secrets Manager
  hasPrivateKey,
  clearModuleCache,
  clearKeyCache,
} from 'battery-pack';
```

## CLI

```bash
battery-pack keygen [--output <dir>]     # Generate RSA-4096 keypair
battery-pack encrypt <file> [--key ...]  # Encrypt a file
battery-pack decrypt <file> [--key ...]  # Decrypt (for debugging)
battery-pack verify                       # Check keypair matches
battery-pack encrypt-batch "<glob>"      # Encrypt multiple files
```

## What to Encrypt

**Good candidates:**
- Core business logic
- API client implementations
- Authentication handlers
- Proprietary algorithms

**Bad candidates:**
- Utility functions (too easy to replace)
- Configuration (needs to be readable)
- UI components (visible anyway)

## Security Model

This is **deterrence, not DRM**:
- AES-256-GCM + RSA-OAEP (cryptographically sound)
- But determined attackers can always reverse-engineer
- The goal is raising the effort bar, not perfect protection

Combine with AGPL: if competitors re-implement your encrypted modules and distribute, they must share under AGPL.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Encryption (build time)                                    │
│                                                             │
│  plaintext.js ──► AES-256-GCM ──► ciphertext                │
│                       ▲                                     │
│                       │                                     │
│              random AES key ──► RSA-OAEP ──► encrypted key  │
│                                    ▲                        │
│                               public key                    │
│                                                             │
│  Output: [key length][encrypted AES key][IV][tag][ciphertext]
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Decryption (runtime)                                       │
│                                                             │
│  encrypted key ──► RSA-OAEP ──► AES key                     │
│                       ▲                                     │
│                  private key                                │
│                                                             │
│  ciphertext ──► AES-256-GCM ──► plaintext.js ──► eval()     │
│                     ▲                                       │
│                 AES key                                     │
└─────────────────────────────────────────────────────────────┘
```

## FAQ

**Is this actually open source?**
Yes. The source code (including encrypted blobs) is publicly available under an OSI-approved license. The encryption key is operational data, not part of the source.

**Doesn't this violate the open source definition?**
No. The OSD requires source code availability and freedom to modify. It doesn't require that the code be runnable without operational infrastructure (servers, databases, API keys, etc.).

**Why not just use BSL/FSL?**
Those restrict *legal* rights. This restricts *practical* ability while preserving full legal rights. Also, BSL/FSL aren't OSI-approved, which can affect GitHub Actions pricing and community perception.

**Can't someone just decrypt and republish?**
If they have the key, yes. That's why you keep the key secret. If they reverse-engineer and re-implement, that's fine — that's the deterrence working as intended.

## License

MIT — use it however you want.

---

*"Open source with assembly required."*
