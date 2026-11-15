"""Simple slide architecture diagram. Run: uv run --with matplotlib python docs/architecture.py"""

from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

GREEN, PURPLE, GREY, INK = "#17703F", "#6B4FBB", "#5B6B61", "#13261B"

fig, ax = plt.subplots(figsize=(16, 8))
ax.set_xlim(0, 16)
ax.set_ylim(0.3, 8.3)
ax.axis("off")


def box(x, y, w, h, title, tech, color, fill="white", dashed=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.25",
                                fc=fill, ec=color, lw=2.5, ls="--" if dashed else "-"))
    ax.text(x + w / 2, y + h / 2 + 0.18, title, ha="center", va="center",
            fontsize=19, fontweight="bold", color=INK)
    ax.text(x + w / 2, y + h / 2 - 0.3, tech, ha="center", va="center", fontsize=14, color=color)


def arrow(a, b, both=True, dashed=False):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="<|-|>" if both else "-|>", mutation_scale=20,
                                 lw=2, color=GREY, ls="--" if dashed else "-"))


# Self-hosted server frame
ax.add_patch(FancyBboxPatch((4.6, 0.5), 11.0, 7.6, boxstyle="round,pad=0,rounding_size=0.35",
                            fc="none", ec=GREEN, lw=2, ls=(0, (6, 4))))
ax.text(4.9, 7.75, "Self-hosted server", fontsize=15, fontweight="bold", color=GREEN)

# Clients
box(0.4, 5.6, 3.4, 1.5, "Shopper App", "React Native · Expo", GREEN)
box(0.4, 3.4, 3.4, 1.5, "Staff Web App", "Next.js", GREEN)
box(0.4, 1.0, 3.4, 1.5, "Product Data", "Open Food Facts · USDA", GREY, dashed=True)

# Server
box(5.4, 3.2, 4.6, 3.9, "", "", GREEN)
ax.text(7.7, 6.55, "Backend API", ha="center", fontsize=19, fontweight="bold", color=INK)
ax.text(7.7, 6.1, "FastAPI", ha="center", fontsize=14, color=GREEN)
box(5.9, 3.6, 3.6, 1.6, "Rules Engine", "Safety decisions", GREEN, fill="#E2F2E7")

box(11.2, 5.3, 3.9, 1.8, "AI Recipes", "Ollama · Qwen 2.5", PURPLE)
box(11.2, 3.2, 3.9, 1.8, "Label Scanning", "PaddleOCR", PURPLE)
box(5.4, 1.0, 4.6, 1.5, "Database", "PostgreSQL", GREEN)

# Connections
arrow((3.8, 6.35), (5.4, 6.0))
arrow((3.8, 4.15), (5.4, 4.5))
arrow((5.4, 3.5), (3.8, 1.9), both=False, dashed=True)
arrow((10.0, 6.2), (11.2, 6.2))
arrow((10.0, 4.1), (11.2, 4.1))
arrow((7.7, 3.2), (7.7, 2.5))

out = Path(__file__).with_name("architecture-simple.png")
fig.savefig(out, dpi=200, transparent=True, bbox_inches="tight", pad_inches=0.2)
print(out)
