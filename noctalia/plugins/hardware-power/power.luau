--!nonstrict
-- Ryzen APU PPT comes from the amdgpu hwmon interface; NVIDIA power comes
-- from NVML through nvidia-smi. Both are readable without root on this host.

local apuWatts = "--"
local nvidiaWatts = "--"
local queryRunning = false

local function render()
  barWidget.setGlyph("bolt")
  barWidget.setGlyphColor("#d95757")
  barWidget.setText(`{apuWatts}W · {nvidiaWatts}W`)
  barWidget.setTooltip({
    { key = "CPU / APU PPT", value = apuWatts .. " W" },
    { key = "NVIDIA GPU", value = nvidiaWatts .. " W" },
  })
end

function update()
  noctalia.setUpdateInterval(2000)
  if queryRunning then
    return
  end

  queryRunning = true
  local command = [[
apu=""
for h in /sys/class/hwmon/hwmon*; do
  [ "$(cat "$h/name" 2>/dev/null)" = "amdgpu" ] || continue
  [ -r "$h/power1_input" ] || continue
  apu=$(awk '{printf "%.1f", $1 / 1000000}' "$h/power1_input")
  break
done
dgpu=$(nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -d ' ')
printf '%s|%s\n' "${apu:---}" "${dgpu:---}"
]]

  noctalia.runAsync(command, function(result)
    queryRunning = false
    if result.exitCode == 0 then
      local a, n = string.match(result.stdout, "([^|\n]+)|([^\n]+)")
      apuWatts = a or "--"
      nvidiaWatts = n or "--"
    end
    render()
  end)
end

render()
