global gAlert, gColorList, gTrace, gScore, gHighScore, glowScore, gHSNetID, gGravitationalConstant, gBonus

on prepareMovie
  clearGlobals()
  gAlert = 0
  gBonus = []
  repeat with s = 41 to 53
    sprite(s).visible = 0
  end repeat
  member("fld_level").word[2] = "0"
  member("fld_score").word[2] = "0"
  gColorList = [rgb(0, 255, 255), rgb(0, 0, 255), rgb(255, 0, 255), rgb(255, 0, 0), rgb(255, 255, 0), rgb(0, 255, 0), rgb(200, 200, 200)]
  gTrace = 1
  gScore = 0
  gHighScore = 0
  gGravitationalConstant = 0.90000000000000002
  member("k1").image = image(17, 26, 32)
  member("k1").image.useAlpha = 1
  member("k1").image.setAlpha(member("Kev_Alph").image)
  member("k2").image = image(17, 26, 32)
  member("k2").image.useAlpha = 1
  member("k2").image.setAlpha(member("Kev_Alph").image)
  member("k3").image = image(17, 26, 32)
  member("k3").image.useAlpha = 1
  member("k3").image.setAlpha(member("Kev_Alph").image)
end

on endGame
  processHSNetString()
  member("fld_high_score_end").word[3] = string(gHighScore)
  member("fld_score_end").word[2] = string(gScore)
  if gScore >= glowScore then
    go("HS FM")
  else
    go("End_Stats")
  end if
end

on onlyLetters tempString
  repeat with c = 1 to tempString.char.count
    cN = charToNum(tempString.char[c])
    if not (((cN >= 65) and (cN <= 90)) or ((cN >= 97) and (cN <= 122))) then
      return 0
    end if
  end repeat
  return 1
end

on trimSpaces tempString
  repeat while tempString.char[1] = " "
    delete tempString.char[1]
  end repeat
  repeat while tempString.char[tempString.char.count] = " "
    delete tempString.char[tempString.char.count]
  end repeat
  return tempString
end

on encodeScore tempScore, fname
  tempScore = string(tempScore) & 3
  fname = fname & 3
  tempAddVal = 0
  tempExp = 1
  repeat with d = 1 to fname.length
    tempAddVal = tempAddVal + (charToNum(fname.char[d]) * tempExp)
    tempExp = tempExp * 2
  end repeat
  tempExp = 1
  repeat with d = 1 to tempScore.length
    tempAddVal = tempAddVal + (charToNum(tempScore.char[d]) * tempExp)
    tempExp = tempExp * 2
  end repeat
  return hexToNum(string(tempAddVal))
end

on hexToNum tempNum
  newNum = 0
  tempExp = 1
  repeat with d = tempNum.length down to 1
    newNum = newNum + (hexDigitValue(tempNum.char[d]) * tempExp)
    tempExp = tempExp * 16
  end repeat
  return newNum
end

on hexDigitValue letter
  case letter of
    "A", "a":
      temp = 10
    "B", "b":
      temp = 11
    "C", "c":
      temp = 12
    "D", "d":
      temp = 13
    "E", "e":
      temp = 14
    "F", "f":
      temp = 15
    otherwise:
      temp = integer(letter)
  end case
  return temp
end

on fString tempString, templength, tF, tempAlign
  newString = EMPTY
  tempString = string(tempString)
  fillLength = templength - tempString.length
  repeat with c = 1 to fillLength
    newString = newString & tF
  end repeat
  case tempAlign of
    #left:
      put tempString before newString
    #right:
      put tempString after newString
    #center:
      put tempString after newString.char[fillLength / 2]
  end case
  return newString
end

on stopMovie
  member("txt_at_top10").text = "Loading High Scores ...."
  member("txt_day_top10").text = "Loading High Scores ...."
  member("k1").image = member("bar_bk").image
  member("k2").image = member("bar_bk").image
  member("k3").image = member("bar_bk").image
  member("fld_high_score_end").word[3] = "0"
  member("fld_score_end").word[2] = "0"
  member("fld_fname").text = EMPTY
  member("fld_state").text = EMPTY
end

on dAlert tempState, tempMessage
  gAlert = tempState
  sprite(41).visible = 1
  sprite(42).visible = 1
  case tempState of
    #scoring:
      repeat with s = 43 to 48
        sprite(s).visible = 1
      end repeat
    #reallyquit:
      repeat with s = 49 to 51
        sprite(s).visible = 1
      end repeat
    #message:
      sprite(52).visible = 1
      sprite(53).visible = 1
      member("fld_Alert").text = tempMessage
  end case
end

on endDAlert
  gAlert = 0
  repeat with s = 41 to 53
    sprite(s).visible = 0
  end repeat
end

on rotationAngle vector
  if vector[1] = 0 then
    if vector[2] > 0 then
      return 90.0
    else
      return -90.0
    end if
  end if
  xFactor = 0
  if vector[1] < 0 then
    xFactor = 180
  end if
  return (atan(vector[2] / float(vector[1])) * 57.29577951308232286) + xFactor
end

on distance points
  return sqrt((points[1] * points[1]) + (points[2] * points[2]))
end

on findPoint refPoint, angle, distance
  angle = angle / 57.29577951308232286
  return refPoint + (point(cos(angle), sin(angle)) * distance)
end

on reloadScores
  global gHSNetID
  url = "http://www.bigideafun.com/cgi/high_scores.pl"
  PLIST = ["game": "spaced_penguin"]
  gHSNetID = postNetText(url, PLIST)
end

on processHSNetString
  tempString = netTextResult(gHSNetID)
  tempArray = [#junk: 0]
  repeat while tempString.length > 3
    if not tempString contains "|" then
      alert("There was an error loading the cake")
      exit repeat
    end if
    tempbreak = offset("|", tempString)
    tempSep = offset("=", tempString)
    addProp(tempArray, chars(tempString, 1, tempSep - 1), chars(tempString, tempSep + 1, tempbreak - 1))
    delete char 1 to tempbreak of tempString
  end repeat
  if getaProp(tempArray, "lowScore") <> VOID then
    glowScore = integer(tempArray.lowScore)
  end if
  if getaProp(tempArray, "AllTime") <> VOID then
    member("txt_at_top10").text = tempArray.AllTime
  end if
  if getaProp(tempArray, "Today") <> VOID then
    member("txt_day_top10").text = tempArray.Today
  end if
  if getaProp(tempArray, "Error") <> VOID then
    dAlert(#message, tempArray["Error"])
  end if
end
