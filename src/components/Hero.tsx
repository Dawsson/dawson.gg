import type { FC } from "hono/jsx";
import { PROFILE } from "../data.ts";

export const Hero: FC = () => (
  <section class="hero">
    <h1 class="hero-name">{PROFILE.name}</h1>
    <p class="hero-intro">{PROFILE.intro}</p>
  </section>
);
