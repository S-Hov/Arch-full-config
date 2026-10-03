--!nonstrict
-- Sensors for the integrated AMD GPU: load, edge temperature and clock.

local usage = "--"
local temperature = "--"
local frequency = "--"
local queryRunning = false

local function render()
  barWidget.setGlyph("device-desktop-analytics")
  barWidget.setText(`iGPU {usage}% · {temperature}° · {frequency}G`)
  barWidget.setTooltip({
    { key = "AMD iGPU usage", value = usage .. " %" },
    { key = "AMD iGPU temperature", value = temperature .. " °C" },
    { key = "AMD iGPU clock", value = frequency .. " GHz" },
  })
end

function update()
  noctalia.setUpdateInterval(2000)
  if queryRunning then
    return
  end

  queryRunning = true
  local command = [[
for card in /sys/class/drm/card[0-9]; do
  [ "$(cat "$card/device/vendor" 2>/dev/null)" = "0x1002" ] || continue
  usage=$(cat "$card/device/gpu_busy_percent" 2>/dev/null || printf '%s' '--')
  temp="--"
  freq="--"
  for h in "$card"/device/hwmon/hwmon*; do
    [ -d "$h" ] || continue
    if [ -r "$h/temp1_input" ]; then
      temp=$(awk '{printf "%.0f", $1 / 1000}' "$h/temp1_input")
    fi
    if [ -r "$h/freq1_input" ]; then
      freq=$(awk '{printf "%.1f", $1 / 1000000000}' "$h/freq1_input")
    fi
  done
  printf '%s|%s|%s\n' "$usage" "$temp" "$freq"
  exit 0
done
printf '%s\n' '--|--|--'
]]

  noctalia.runAsync(command, function(result)
    queryRunning = false
    if result.exitCode == 0 then
      local u, t, f = string.match(result.stdout, "([^|\n]+)|([^|\n]+)|([^\n]+)")
      usage = u or "--"
      temperature = t or "--"
      frequency = f or "--"
    end
    render()
  end)
end

render()
