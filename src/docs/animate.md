**Handles/tools** and the **underlying math/logic** Animate engine/runtime should support. I’ll structure this as:

1. **STEM content areas that benefit from illustrations**
2. **Core types of interactions / animations**
3. **Mathematical / physics functions likely needed**
4. **Initial set of handles/tools for the user in Mava Studio**
5. **How Rive could integrate**

---

## 1️⃣ STEM Content Areas Needing Illustrations

Here are categories where **illustrations are crucial**:

| STEM Area                     | Example Illustration Needs                                                                          | Notes                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Physics**                   | Projectile motion, pendulum, inclined plane, electric circuits (moving electrons), forces & torques | Dynamic paths, parametric motion, vector arrows, overlays                     |
| **Chemistry**                 | Molecules, atomic orbitals, reaction processes, lab apparatus                                       | Rotations, bonding angles, molecule animations, reactant → product animations |
| **Biology / Anatomy**         | Heart pumping, hand anatomy, digestive system flow, neuron signals                                  | Layered structures, jointed parts, highlight interactions                     |
| **Mathematics / Geometry**    | Graphing functions, geometric transformations, 3D rotations, vector operations                      | Parametric curves, axes, labels, scaling                                      |
| **Engineering / Mechanics**   | Gear systems, hydraulic systems, bridges under load, torque visualization                           | Rotations, linear motion, forces applied, energy transformations              |
| **Astronomy / Space Science** | Planet orbits, tidal forces, orbital mechanics, gravity wells                                       | Parametric orbits, paths, vector forces, rotational motion                    |
| **Electronics / Circuits**    | Current flow, logic gates, signal timing                                                            | Dynamic signals, toggling, flow animation                                     |

> Common factor: all require **dynamic, parametric illustrations** that can be **controlled by numeric parameters or user input**.

---

## 2️⃣ Core Types of Interactions / Animations

* **Parametric motion** – Move an object along a path based on numeric input (`x(t), y(t)` functions).
* **Rotations / joints** – Arms, gears, pendulums, etc.
* **Scaling / resizing** – Molecules growing/shrinking, graph zooming.
* **Highlight / annotation triggers** – Show arrows, labels, or color overlays on click/hover.
* **State changes** – Valve open/close, switch on/off, neuron firing.
* **Combining multiple objects** – Collisions, force vectors, linked animations.
* **Timeline sequencing** – Trigger a sequence of actions automatically (Rive timeline + state machine).

---

## 3️⃣ Math / Physics Functions Likely Needed

To support dynamic illustrations in **STEM content**, your runtime may need:

| Type                           | Examples / Functions                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| **Kinematics**                 | Projectile motion, uniform/accelerated motion, rotation matrices, pendulum angles  |
| **Forces & vectors**           | Vector addition, torque, friction, gravity, normal forces, centripetal/centrifugal |
| **Geometry / transformations** | 2D/3D transformations, rotation, scaling, reflection, translation                  |
| **Trigonometry**               | Sin, cos, tan → essential for angles, rotations, pendulums, orbital paths          |
| **Algebra / parametrics**      | Solve for position, distance, intersection points                                  |
| **Probability / statistics**   | Randomized particle motion, diffusion, chemical reaction simulations               |
| **Periodic / wave motion**     | Sine/cosine waves for sound, oscillations, AC currents                             |

> Essentially, you need **a lightweight math “engine”** embedded in the content creator, possibly as a small JS/TS helper library.

---

## 4️⃣ Initial Set of Handles / Tools for Mava Studio Users

We can imagine **users interacting with your illustrations** via a set of “handles” that correspond to **parameters they can tweak**, which internally drive Rive + math calculations.

| Handle / Tool                    | What It Does                                    | STEM Use Cases                                               |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| **Move / Drag**                  | Move object in 2D/3D space                      | Physics lab: move a block on ramp, position planets          |
| **Rotate / Joint**               | Rotate around pivot / hinge                     | Pendulum, robotic arms, gears, body parts                    |
| **Scale / Resize**               | Increase/decrease size                          | Molecules, graphs, cells                                     |
| **Force / Velocity Input**       | Slider or numeric input controlling motion      | Projectile motion, collision simulation                      |
| **Angle / Direction Input**      | Slider/handle for rotation                      | Launch angle, vector direction                               |
| **Play / Pause / Step**          | Control timeline or state machine               | Step through a chemical reaction, circuit switching          |
| **Annotation / Label**           | Add text, arrow, or highlight dynamically       | Show vector magnitude, label organ, indicate distance/height |
| **Path Editor**                  | Optional: define custom motion paths            | Waveforms, orbit trajectories, motion along curve            |
| **Color / Highlight**            | Change color or opacity of parts                | Signal on/off, highlight active region                       |
| **Randomizer / Parameter Sweep** | Run multiple simulations with varied parameters | Probability experiments, particle motion                     |

> Each handle maps to **Rive inputs or animation state variables** (numeric or boolean). Math functions in the backend compute exact positions/rotations to update the Rive runtime in real time.

---

## 5️⃣ How Rive Fits in

* **Rive = visual actor / illustration engine**: Characters, lab equipment, body parts, molecules.
* **Math engine = parameter calculator**: Compute positions, paths, rotations, scaling, forces.
* **Handles = input layer**: Sliders, drag handles, buttons that adjust math engine parameters → feed values to Rive state machine inputs → update animation in real time.
* **Serialization**: Store lesson JSON:

```json
{
  "objects": [
    { "name": "ball", "type": "rigid", "velocity": 10, "angle": 45 },
    { "name": "child", "animation": "kick" }
  ],
  "annotations": [
    { "type": "arrow", "from": [0,0], "to": [5,10], "label": "trajectory" }
  ]
}
```

* **Rendering Flow**:

```
[User Input / Handles] --> [Math Engine] --> [Rive State Machine Inputs] --> [Animation Output]
```

* All objects remain **parametric**, so the lesson content is **editable, serializable, and reusable**.

---

### ✅ Next Step

If you want, I can **draft a concrete “initial toolkit for STEM illustrations”** for Mava Studio:

* Include **handles/widgets for the user**
* Define **math functions needed for each handle**
* Show **how each maps to Rive inputs / animation control**

