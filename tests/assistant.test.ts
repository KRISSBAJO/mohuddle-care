import assert from "node:assert/strict";
import { test } from "node:test";
import { matchPeople, parseRequest } from "../src/lib/assistant";
import { searchHelp } from "../src/lib/help";

const kind = (text: string) => parseRequest(text).kind;

test("clocking and breaks, typed or spoken", () => {
  assert.equal(kind("Clock me in."), "clock_in");
  assert.equal(kind("hey mohuddle, I'm here for my shift"), "clock_in");
  assert.equal(kind("Clock me out please"), "clock_out");
  assert.equal(kind("I'm going home"), "clock_out");
  assert.deepEqual(parseRequest("Start my lunch break"), { kind: "break_start", break: "meal" });
  assert.deepEqual(parseRequest("take a 15 minute break"), { kind: "break_start", break: "rest" });
  assert.deepEqual(parseRequest("start my break"), { kind: "break_start", break: null });
  assert.equal(kind("I'm back from break"), "break_end");
  assert.equal(kind("end my break"), "break_end");
});

test("questions about my day", () => {
  assert.equal(kind("When is my next shift?"), "next_shift");
  assert.equal(kind("Who's on shift?"), "whos_on");
  assert.equal(kind("How many hours have I worked this week?"), "my_hours");
  assert.equal(kind("What's due?"), "whats_due");
  assert.equal(kind("what's my leave balance"), "leave");
});

test("how-to questions are help, not commands", () => {
  assert.deepEqual(parseRequest("How do I clock in?"), { kind: "help", query: "How do I clock in?" });
  assert.equal(kind("where do I sign my timesheet"), "help");
  assert.equal(kind("help"), "help");
});

test("people and pages", () => {
  assert.deepEqual(parseRequest("Write a note for Aisha Robinson"), { kind: "write_note", person: "Aisha Robinson" });
  assert.deepEqual(parseRequest("report an incident for Sam."), { kind: "incident", person: "Sam" });
  assert.deepEqual(parseRequest("Open the MAR"), { kind: "open", page: "mar" });
  assert.deepEqual(parseRequest("take me to my timesheets"), { kind: "open", page: "timesheets" });
  assert.equal(kind("thanks"), "greeting");
  assert.equal(kind("purple elephants"), "unknown");
});

test("names match people by full, first or partial name", () => {
  const people = [
    { first: "Aisha", last: "Robinson" },
    { first: "Marcus", last: "Lee" },
    { first: "Marcia", last: "Lopez" },
  ];
  assert.deepEqual(matchPeople(people, "Aisha Robinson"), [people[0]]);
  assert.deepEqual(matchPeople(people, "marcus"), [people[1]]);
  assert.deepEqual(matchPeople(people, "Marc"), [people[1], people[2]]);
  assert.deepEqual(matchPeople(people, "nobody"), []);
});

test("help finds the right article", () => {
  assert.equal(searchHelp("How do I clock in?")[0]?.id, "clock-in");
  assert.equal(searchHelp("where do I sign my timesheet")[0]?.id, "timesheet");
  assert.equal(searchHelp("why was I logged out")[0]?.id, "signed-out");
  assert.equal(searchHelp("how do I report a fall")[0]?.id, "incident");
  assert.equal(searchHelp("how do I turn on phone alerts")[0]?.id, "notifications");
  assert.deepEqual(searchHelp("zebra"), []);
});
