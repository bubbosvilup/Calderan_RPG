import { loadWorld } from "../world/loader.js";
import { FileCampaignRepository } from "../persistence/campaign-repository.js";
import { validateSaveId } from "../persistence/save-format.js";
import { CURRENT_SAVE_VERSION } from "../persistence/save-migrations.js";
import { saveError } from "../persistence/errors.js";

try {
  if (process.argv.length !== 3) throw new Error("usage");
  const id = validateSaveId(process.argv[2]);
  const repository = new FileCampaignRepository(await loadWorld("data"));
  const entry = (await repository.listSaves()).find(save => save.campaign_id === id);
  process.stdout.write(JSON.stringify(entry ? { supported_schema_version: CURRENT_SAVE_VERSION, supported_schema_versions: [1, CURRENT_SAVE_VERSION], ...entry } : { campaign_id: id, status: "not_found" }, null, 2) + "\n");
} catch (error) {
  process.stderr.write(process.argv.length !== 3 ? "Usage: npm run inspect:save -- <campaign-id>\n" : `${saveError(error).message}\n`);
  process.exitCode = 1;
}
