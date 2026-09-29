import type { CampaignCommand } from "./types.js";
import type { PreparationContext } from "./preparation.js";
import { findRequired, worldMinute } from "./preparation.js";
import { fail } from "./validation.js";

export function prepareAgendaCommand(context: PreparationContext, command: CampaignCommand): boolean {
  const { draft, refs } = context;
  switch (command.kind) {
    case "create_goal":
      refs.newId(command.id, "goal"); refs.character(command.character_id);
      if (command.target) refs.target(command.target);
      draft.goals.push({ id: command.id, character_id: command.character_id, description: command.description, status: "active", created_at: worldMinute(context), ...(command.target ? { target: command.target } : {}) }); return true;
    case "set_goal_status": {
      const goal = findRequired(draft.goals, command.goal_id, "goal_id");
      if (goal.status !== command.status && goal.status !== "active") fail("goal.status", "terminal goal cannot transition");
      goal.status = command.status; return true;
    }
    case "schedule_event":
      refs.newId(command.id, "event"); command.participants?.forEach(id => refs.character(id));
      draft.scheduled_events.push({ id: command.id, title: command.title, scheduled_world_minute: command.scheduled_world_minute, status: "scheduled",
        ...(command.description === undefined ? {} : { description: command.description }), ...(command.participants === undefined ? {} : { participants: [...command.participants].sort() }) }); return true;
    case "set_event_status": {
      const event = findRequired(draft.scheduled_events, command.event_id, "event_id");
      if (event.status !== command.status) {
        const allowed = event.status === "scheduled" ? ["triggered", "cancelled"] : event.status === "triggered" ? ["completed", "cancelled"] : [];
        if (!allowed.includes(command.status)) fail("event.status", "invalid event lifecycle transition");
      }
      event.status = command.status; return true;
    }
    case "reschedule_event": {
      const event = findRequired(draft.scheduled_events, command.event_id, "event_id");
      if (event.status !== "scheduled") fail("event.status", "only scheduled events may be rescheduled");
      event.scheduled_world_minute = command.scheduled_world_minute; return true;
    }
    default: return false;
  }
}
