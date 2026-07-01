import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CarryoverCard } from "@/components/carryover-card";

afterEach(() => {
  cleanup();
});

describe("CarryoverCard", () => {
  it("shows the outstanding total and months-owing count", () => {
    render(<CarryoverCard totalOutstanding={9750} monthsOwing={2} />);

    expect(screen.getByText("₹9,750")).toBeInTheDocument();
    expect(screen.getByText("2 months over")).toBeInTheDocument();
  });

  it("uses singular 'month' when only one is owing", () => {
    render(<CarryoverCard totalOutstanding={3300} monthsOwing={1} />);

    expect(screen.getByText("1 month over")).toBeInTheDocument();
  });

  it("shows an all-settled state when nothing is outstanding", () => {
    render(<CarryoverCard totalOutstanding={0} monthsOwing={0} />);

    expect(screen.getByText("All settled")).toBeInTheDocument();
  });

  it("links to the carryover page", () => {
    render(<CarryoverCard totalOutstanding={100} monthsOwing={1} />);

    const link = screen.getByRole("link", { name: /manage carryover/i });
    expect(link).toHaveAttribute("href", "/carryover");
  });
});
