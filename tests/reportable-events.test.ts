import assert from "node:assert/strict";
import { test } from "node:test";
import { EVENT_GROUPS, INTERVENTION_GROUPS, categoryFor, eventLabel, eventTier, isEventKey, isInterventionKey } from "../src/lib/reportable-events";

test("event keys are unique across every tier and section", () => {
  const keys = EVENT_GROUPS.flatMap(group => group.events.map(event => event.key));
  assert.equal(new Set(keys).size, keys.length);
  const interventions = INTERVENTION_GROUPS.flatMap(group => group.items.map(item => item.key));
  assert.equal(new Set(interventions).size, interventions.length);
});

test("the most urgent tier wins", () => {
  assert.equal(eventTier([]), "");
  assert.equal(eventTier(["m_uti"]), "reportable");
  assert.equal(eventTier(["m_uti", "t2_neglect"]), "tier2");
  assert.equal(eventTier(["t2_neglect", "t1_injury_unknown", "b_property"]), "tier1");
  assert.equal(eventTier(["not-a-key"]), "");
});

test("internal categories follow the event types", () => {
  assert.equal(categoryFor(["t1_physical_abuse"]), "allegation");
  assert.equal(categoryFor(["b_property"]), "property");
  assert.equal(categoryFor(["b_physical_aggression"]), "behavioural");
  assert.equal(categoryFor(["o_med_variance"]), "medication_error");
  assert.equal(categoryFor(["o_missing"]), "elopement");
  assert.equal(categoryFor(["o_fall_injury"]), "injury");
  assert.equal(categoryFor(["m_flu"]), "other");
});

test("keys are checked before they are saved", () => {
  assert.equal(isEventKey("t1_sexual_abuse"), true);
  assert.equal(isEventKey("t1_made_up"), false);
  assert.equal(isInterventionKey("i_911"), true);
  assert.equal(isInterventionKey("i_teleport"), false);
  assert.equal(eventLabel("m_sepsis"), "Sepsis");
});
