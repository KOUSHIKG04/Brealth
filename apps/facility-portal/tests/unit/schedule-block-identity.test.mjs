import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTestModule } from "../../scripts/load-test-module.mjs";

test("time-block identity survives edits and removing an earlier row; UI IDs never reach settings", () => {
  const states=[];let cursor=0,nextId=0; const changes=[];
  const jsx=(type,props,key)=>({type,props:props??{},key});
  const { ScheduleTimeBlocks }=loadTestModule(fileURLToPath(new URL("../../src/features/doctors/components/ScheduleTimeBlocks.tsx",import.meta.url)),{
    mocks:{react:{useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==="function"?initial():initial;return[states[i],next=>{states[i]=next;}];}},"react/jsx-runtime":{jsx,jsxs:jsx},"@startup/web-ui/components/ui/button":{Button:"Button"},"./ClockTimePicker":{ClockTimePicker:"Clock"}},
    globals:{crypto:{randomUUID:()=>`row-${++nextId}`}},
  });
  const props={initialBlocks:[{start:"09:00",end:"11:00"},{start:"14:00",end:"16:00"}],end:"16:00",pending:false,onChange:next=>changes.push(next)};
  const render=()=>{cursor=0;return ScheduleTimeBlocks(props);};
  const nodes=node=>!node?[]:Array.isArray(node)?node.flatMap(nodes):typeof node!=="object"?[]:[node,...nodes(node.props?.children)];
  let tree=nodes(render()); const original=tree.filter(node=>node.key).map(node=>node.key);
  tree.find(node=>node.type==="Clock").props.onChange("09:30");
  tree=nodes(render()); assert.deepEqual(tree.filter(node=>node.key).map(node=>node.key),original);
  tree.find(node=>node.type==="Button").props.onClick();
  tree=nodes(render()); assert.deepEqual(tree.filter(node=>node.key).map(node=>node.key),[original[1]]);
  assert.equal(changes.at(-1)[0].start,"14:00");
  assert.deepEqual(Object.keys(changes.at(-1)[0]).sort(),["end","start"]);
});
