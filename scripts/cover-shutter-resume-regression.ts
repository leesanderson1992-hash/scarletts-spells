import assert from "node:assert/strict";
import { resumedShutterState } from "../components/adle/activities/shared/cover-shutter";

assert.equal(resumedShutterState(undefined), "look");
assert.equal(resumedShutterState("look"), "look");
assert.equal(resumedShutterState("cover"), "write");
assert.equal(resumedShutterState("write"), "write");
assert.equal(resumedShutterState("check"), "check");
console.log("Cover shutter durable resume regression passed");
