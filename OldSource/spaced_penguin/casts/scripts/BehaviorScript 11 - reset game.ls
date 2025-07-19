global gScore

on mouseUp me
  member("fld_level").word[2] = "0"
  gScore = 0
  member("fld_score").word[2] = string(gScore)
end
