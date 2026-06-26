import { test, expect } from '@playwright/test';
import {
  getDragListOrder,
  dragItemToTarget,
} from '../../actions/dragList/dragList.actions';

// The `WithFanInConnectionOrder` story: three Source nodes fan into the
// Combiner's single `Inputs` handle, so that handle shows a connection-reorder
// badge. Single-connection handles must NOT show one.
const STORY = 'organisms-fullgraph--with-fan-in-connection-order';
const TRIGGER_NAME = /Reorder \d+ input connections/;

test.describe('Ordered inputs for multi-connection handles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/iframe.html?id=${STORY}&viewMode=story`);
    await page
      .getByRole('button', { name: TRIGGER_NAME })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 });
  });

  test('badge appears only on the fan-in handle', async ({ page }) => {
    // Exactly one fan-in input in this story (the Combiner's `Inputs`); the three
    // Source outputs and the Combiner's output are single/unconnected and bear no
    // badge.
    await expect(page.getByRole('button', { name: TRIGGER_NAME })).toHaveCount(
      1,
    );
  });

  test('reorders the connections via drag and persists the new order', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: TRIGGER_NAME }).first();

    await trigger.click();
    await page
      .locator('[data-slot="drag-list"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    const initial = await getDragListOrder(page);
    expect(initial).toHaveLength(3);
    expect(initial[0]).toContain('Source A');
    expect(initial[2]).toContain('Source C');

    // Drag Source C above Source A → expect C, A, B.
    await dragItemToTarget(page, 'Source C', 'Source A', 'above');
    const reordered = await getDragListOrder(page);
    expect(reordered[0]).toContain('Source C');
    expect(reordered[1]).toContain('Source A');

    // Persisted? Close, reopen — the list re-seeds from the saved per-edge order,
    // so the new order must survive.
    await page.keyboard.press('Escape');
    await page
      .locator('[data-slot="drag-list"]')
      .waitFor({ state: 'hidden', timeout: 10000 });
    await trigger.click();
    await page
      .locator('[data-slot="drag-list"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    const afterReopen = await getDragListOrder(page);
    expect(afterReopen[0]).toContain('Source C');
    expect(afterReopen[1]).toContain('Source A');
  });
});
