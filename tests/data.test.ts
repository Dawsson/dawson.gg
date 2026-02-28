import { describe, expect, test } from "bun:test";
import {
  PROFILE,
  PROJECTS,
  TECHNOLOGIES,
  CATEGORY_LABELS,
} from "../src/lib/data";

describe("data integrity", () => {
  test("profile has required fields", () => {
    expect(PROFILE.name).toBeTruthy();
    expect(PROFILE.title).toBeTruthy();
    expect(PROFILE.intro).toBeTruthy();
    expect(PROFILE.links.length).toBeGreaterThan(0);
  });

  test("all projects have required fields", () => {
    for (const project of PROJECTS) {
      expect(project.slug).toBeTruthy();
      expect(project.title).toBeTruthy();
      expect(project.description).toBeTruthy();
      expect(project.technologies.length).toBeGreaterThan(0);
    }
  });

  test("project slugs are unique", () => {
    const slugs = PROJECTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("technology slugs are unique", () => {
    const slugs = TECHNOLOGIES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("all technology categories have labels", () => {
    const categories = new Set(TECHNOLOGIES.map((t) => t.category));
    for (const category of categories) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  test("at least one featured project exists", () => {
    expect(PROJECTS.some((p) => p.featured)).toBe(true);
  });

  test("at least one featured technology exists", () => {
    expect(TECHNOLOGIES.some((t) => t.featured)).toBe(true);
  });
});
