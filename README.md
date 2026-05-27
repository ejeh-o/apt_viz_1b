# apt_viz_1b

Apartment visualization and walkthrough based on the supplied Avalon floor plan.

## Run locally

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`.
Click inside the visualization to start walking around.

To test the production build:

```bash
npm run build
npx vite preview --host 127.0.0.1
```

## Controls

- `WASD` or arrow keys: move
- Mouse: look around
- `Shift`: walk faster
- `Esc`: release the mouse
- `M`: toggle top-down plan view

## Scale

- `1` Three.js world unit equals `1 ft`
- First-person eye height is `6 ft`
- Apartment ceiling height is `8 ft`
