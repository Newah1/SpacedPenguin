property pSprite, pSArrow, pSLS1, pSLS2, pSLS3, pSHoopT, pSHoopB, pSRubberT, pSRubberB, pMember, pMRubber, pPoint, pState, pLocPrev, pVX, pVY, pOriginalHoopAngle, pTarget, pFrameCount, pFlightRect, pStageRect, pTries, pDistance, pScoreList, pScoreListIndex, pScoreTargetVal, pScoreAddRate, pScoreCurVal, pScoreFinalVal, pBKDMember, pBorder, pTraceColor, plastLevel, pAniFrame, pAniDir, pAniMax, pAniMin, pAniSwap, pStretchLimit
global gPlanets, gGame, gAlert, gColorList, gTrace, gScore, gHighScore, glowScore, gGravitationalConstant, gBonus

on beginSprite me
  pBKDMember = member("bk_Drop")
  pBKDMember.image.fill(0, 0, 500, 400, rgb(0, 0, 0))
  pSprite = sprite(me.spriteNum)
  pSArrow = sprite(me.spriteNum - 3)
  pSLS1 = sprite(me.spriteNum - 4)
  pSLS2 = sprite(me.spriteNum - 5)
  pSLS3 = sprite(me.spriteNum - 6)
  pSHoopT = sprite(me.spriteNum + 2)
  pSHoopB = sprite(me.spriteNum - 2)
  pSRubberT = sprite(me.spriteNum - 1)
  pSRubberB = sprite(me.spriteNum + 1)
  pMRubber = pSRubberB.member
  pTries = 0
  member("fld_tries").word[2] = string(pTries)
  pSLS1.loc = point(1000, 1000)
  pSLS2.loc = point(1000, 1000)
  pSLS3.loc = point(1000, 1000)
  pSArrow.loc = point(1000, 1000)
  pSHoopB.loc = pSHoopT.loc
  pOriginalHoopAngle = pSHoopT.rotation
  pDistance = 0
  member("fld_distance").word[2] = string(integer(pDistance))
  pFlightRect = rect(-pBorder, -pBorder, (the stage).rect.right - (the stage).rect.left + pBorder, (the stage).rect.bottom - (the stage).rect.top + pBorder)
  pStageRect = rect(0, 0, (the stage).rect.right - (the stage).rect.left, (the stage).rect.bottom - (the stage).rect.top)
  resetGPS()
  member("fld_level").word[2] = string(1 + integer(member("fld_level").word[2]))
end

on prepareFrame me
  if (gAlert <> 0) and (gAlert <> #scoring) then
    return 
  end if
  case pState of
    #soaring:
      soaringFrame()
    #pullback:
      pullbackFrame()
    #snapping:
      snappingFrame()
    #crashed:
      crashedFrame()
    #hitTarget:
      hitTargetFrame()
    #scoring:
      scoringFrame()
  end case
end

on exitFrame
  if pState = #next_level then
    if plastLevel then
      endGame()
    else
      go(the frame + 1)
    end if
  end if
end

on setUpSoaring
  pState = #soaring
  pSHoopT.visible = 0
  pSHoopB.visible = 0
  pSRubberT.visible = 0
  pSRubberB.visible = 0
  pDistance = 0
  member("fld_distance").word[2] = string(integer(pDistance))
  if gTrace then
    pBKDMember.image.draw(pSprite.loc[1], pSprite.loc[2], pSLS1.locH, pSLS1.locV, pTraceColor)
  end if
end

on soaringFrame
  pLocPrev = pPoint
  tempNumPlanets = gPlanets.count
  repeat with p = 1 to tempNumPlanets
    tempChangeLoc = sprite(gPlanets[p][1]).loc - pPoint
    tempDistance = distance(tempChangeLoc)
    if tempDistance < gPlanets[p][4] then
      if tempDistance < gPlanets[p][3] then
        puppetSound(1, "snd_HitPlanet")
        setUpCrashed(gPlanets[p][1])
      end if
      tempDistSquared = (tempChangeLoc[1] * tempChangeLoc[1]) + (tempChangeLoc[2] * tempChangeLoc[2])
      tempGravitationalForce = 0
      if tempDistSquared > 0 then
        tempGravitationalForce = gPlanets[p][2] * gGravitationalConstant / tempDistSquared
      end if
      pVX = pVX + (tempGravitationalForce * tempChangeLoc[1])
      pVY = pVY + (tempGravitationalForce * tempChangeLoc[2])
    end if
  end repeat
  if gBonus.count > 0 then
    repeat with b = 1 to gBonus.count
      if distance(pSprite.loc - sprite(gBonus[b]).loc) < (8 + (sprite(gBonus[b]).width / 2)) then
        pDistance = pDistance + sendSprite(gBonus[b], #collectBonus)
      end if
    end repeat
  end if
  pPoint = pPoint + point(pVX, pVY)
  pSprite.loc = pPoint
  if gTrace then
    pBKDMember.image.draw(pSprite.loc[1], pSprite.loc[2], pLocPrev[1], pLocPrev[2], pTraceColor)
  end if
  tempDis = distance(pPoint - pLocPrev)
  pDistance = pDistance + tempDis
  member("fld_distance").word[2] = string(integer(pDistance))
  if sprite pSprite.spriteNum intersects sprite(sprite(pTarget).spriteNum) then
    setUpHitTarget()
  else
    if not inside(pSprite.loc, pFlightRect) then
      pState = #crashed
      pFrameCount = 2
    else
      if not inside(pSprite.loc, pStageRect) then
        setArrow()
      else
        pSArrow.loc = point(1000, 1000)
      end if
    end if
  end if
  if pAniSwap then
    pAniFrame = pAniFrame + pAniDir
    if pAniFrame < pAniMin then
      pAniFrame = pAniMax
    end if
    if pAniFrame > pAniMax then
      pAniFrame = pAniMin
    end if
    pSprite.member = member(pAniFrame)
    pAniSwap = 0
  else
    pAniSwap = 1
  end if
end

on setUpCrashed tempHitPlanet
  pState = #crashed
  pFrameCount = 300
  setBounceOffPlanet(tempHitPlanet)
  tempAngle = rotationAngle(pSprite.loc - sprite(tempHitPlanet).loc)
  tempPoint = findPoint(point(0.0, 0.0), tempAngle, distance(point(pVX, pVY)))
  pVX = tempPoint[1]
  pVY = tempPoint[2]
  setUpAnimation()
end

on setBounceOffPlanet tempHitPlanet
  tempAngle = rotationAngle(pSprite.loc - sprite(tempHitPlanet).loc)
  tempPoint = findPoint(point(0.0, 0.0), tempAngle, distance(point(pVX, pVY)))
  pVX = tempPoint[1]
  pVY = tempPoint[2]
end

on crashedFrame
  pFrameCount = pFrameCount - 1
  pPoint = pPoint + point(pVX, pVY)
  pSprite.loc = pPoint
  pAniFrame = pAniFrame + pAniDir
  if pAniFrame < pAniMin then
    pAniFrame = pAniMax
  end if
  if pAniFrame > pAniMax then
    pAniFrame = pAniMin
  end if
  pSprite.member = member(pAniFrame)
  tempHitPlanet = intersectsPlanets(pSprite.loc)
  if tempHitPlanet then
    setBounceOffPlanet(tempHitPlanet)
    puppetSound(1, "snd_HitPlanet")
  end if
  if (pFrameCount < 1) or not inside(pSprite.loc, pStageRect) then
    pSprite.rotation = 0
    resetGPS()
    pState = #iddle
  end if
end

on tryAgain me
  pState = #iddle
  resetGPS()
end

on intersectsPlanets tempPoint
  tempNumPlanets = gPlanets.count
  repeat with p = 1 to tempNumPlanets
    tempChangeLoc = tempPoint - sprite(gPlanets[p][1]).loc
    if distance(tempChangeLoc) < gPlanets[p][3] then
      return p
    end if
  end repeat
  return 0
end

on setUpHitTarget
  puppetSound(1, "snd_enterShip")
  pState = #hitTarget
  pFrameCount = 30
  pSprite.loc = point(1000, 1000)
  sprite(pTarget).member = member("ship_open")
  pScoringState = #ship
  member("fld_score_actual").text = member("text_function").text
end

on finishScoring me
  gScore = pScoreFinalVal
  member("snd_entership").loop = 0
  puppetSound(1, 0)
  if gScore > gHighScore then
    gHighScore = gScore
  end if
  member("fld_score").word[2] = gScore
  member("fld_score_total").word[3] = string(gScore)
  member("fld_your_high_score").word[3] = string(gHighScore)
  endDAlert()
  pState = #next_level
  member("bk_drop").image.fill(0, 0, 500, 400, rgb(0, 0, 0))
end

on hitTargetFrame
  pFrameCount = pFrameCount - 1
  if pFrameCount < 0 then
    sprite(pTarget).member = member("ship")
    setUpScoring()
  end if
end

on setUpScoring me
  pState = #scoring
  pScoreListIndex = 0
  tempDist = integer(member("fld_distance").word[2])
  tempLevel = integer(member("fld_level").word[2])
  tempTries = integer(member("fld_tries").word[2])
  tempScore = tempDist * tempLevel / tempTries
  pScoreList = [[tempDist, integer(sqrt(tempDist)) * 5, 15, "arp"]]
  pScoreList[2] = [tempLevel, 0.25, 15, "snd_entership"]
  pScoreList[3] = [tempTries, 0.25, 15, "snd_entership"]
  pScoreList[4] = [tempScore, integer(sqrt(tempScore)) * 5, 60, "arp"]
  pScoreFinalVal = pScoreList[4][1] + gScore
  member("fld_score_actual").text = member("text_function").text
  member("fld_score_actual").word[1] = fString(0, 8, " ", #right)
  member("fld_score_actual").word[3] = fString(0, 5, " ", #center)
  member("fld_score_actual").word[5] = fString(0, 5, " ", #center)
  member("fld_score_actual").word[7] = fString(0, 5, " ", #left)
  member("fld_your_high_score").word[3] = gHighScore
  member("fld_Level_complete").word[2] = tempLevel
  member("fld_score_total").word[3] = string(gScore)
  setUpNextScoring()
  dAlert(#scoring)
end

on setUpNextScoring
  pScoreListIndex = pScoreListIndex + 1
  pScoreTargetVal = pScoreList[pScoreListIndex][1]
  pScoreAddRate = pScoreList[pScoreListIndex][2]
  pFrameCount = pScoreList[pScoreListIndex][3]
  member(pScoreList[pScoreListIndex][4]).loop = 1
  puppetSound(1, pScoreList[pScoreListIndex][4])
  pScoreCurVal = 0 * pScoreTargetVal
end

on scoringFrame me
  if pScoreCurVal = pScoreTargetVal then
    pFrameCount = pFrameCount - 1
    if pFrameCount < 1 then
      if pScoreListIndex = pScoreList.count then
        finishScoring()
      else
        setUpNextScoring()
      end if
    end if
  else
    pScoreCurVal = pScoreCurVal + pScoreAddRate
    if pScoreCurVal >= pScoreTargetVal then
      pScoreCurVal = pScoreTargetVal
      puppetSound(1, 0)
      member(pScoreList[pScoreListIndex][4]).loop = 0
    end if
    case pScoreListIndex of
      1:
        member("fld_score_actual").char[1..8] = fString(pScoreCurVal, 8, " ", #right)
      2:
        member("fld_score_actual").char[12..16] = fString(integer(pScoreCurVal), 5, " ", #center)
      3:
        member("fld_score_actual").char[20..24] = fString(integer(pScoreCurVal), 5, " ", #center)
      4:
        tempCurScore = gScore + pScoreCurVal
        if tempCurScore > gHighScore then
          gHighScore = tempCurScore
        end if
        delete member("fld_score_actual").word[7]
        put fString(pScoreCurVal, 8, " ", #left) after (member "fld_score_actual").char[27]
        member("fld_score").word[2] = tempCurScore
        member("fld_score_total").word[3] = string(tempCurScore)
        member("fld_your_high_score").word[3] = string(gHighScore)
    end case
  end if
end

on setArrow
  pSArrow.loc = pSprite.loc
  if pSArrow.locH < 0 then
    pSArrow.locH = 0
  else
    if pSArrow.locH > pStageRect.right then
      pSArrow.locH = pStageRect.right
    end if
  end if
  if pSArrow.locV < 0 then
    pSArrow.locV = 0
  else
    if pSArrow.locV > pStageRect.bottom then
      pSArrow.locV = pStageRect.bottom
    end if
  end if
  pSArrow.rotation = rotationAngle(pSprite.loc - pSArrow.loc)
  pSArrow.width = 20 + (distance(pSprite.loc - pSArrow.loc) / 2)
end

on resetGPS me
  pTraceColor = gColorList[(integer(member("fld_tries").word[2]) mod gColorList.count) + 1]
  pSHoopT.visible = 1
  pSHoopB.visible = 1
  pSRubberT.visible = 1
  pSRubberB.visible = 1
  pSArrow.loc = point(1000, 1000)
  pState = #iddle
  pSHoopB.rotation = pSHoopT.rotation
  pPoint = findPoint(pSHoopT.loc, pSHoopT.rotation, 30.0)
  pSprite.loc = pPoint
  pSprite.rotation = 0
  setRubberBands(30)
  pSLS1.visible = 1
  pSLS2.visible = 1
  pSLS3.visible = 1
  setUpAnimation()
  if gBonus.count > 0 then
    repeat with s = 1 to gBonus.count
      sendSprite(gBonus[s], #resetBonus)
    end repeat
  end if
end

on setUpAnimation
  pAniSwap = 1
  pSprite.member = member(75 + (12 * (random(3) - 1)))
  pAniFrame = pSprite.memberNum
  pAniMax = pSprite.memberNum + 11
  pAniMin = pSprite.memberNum
  pAniDir = random(2)
  if pAniDir = 2 then
    pAniDir = -1
  end if
end

on setRubberBands kevinDistance
  tempRadius = (pSHoopT.height / 2) - 3
  pSRubberT.loc = findPoint(pSHoopT.loc, pSHoopT.rotation - 90, tempRadius)
  pSRubberB.loc = findPoint(pSHoopT.loc, pSHoopT.rotation + 90, tempRadius)
  tempRubberWidth = sqrt((tempRadius * tempRadius) + (kevinDistance * kevinDistance))
  pSRubberT.width = tempRubberWidth
  pSRubberB.width = tempRubberWidth
  if float(kevinDistance) <> 0.0 then
    tempDifAngle = atan(tempRadius / float(kevinDistance)) * 57.29577951308232286
  else
    tempDifAngle = 90
  end if
  pSRubberT.rotation = pSHoopT.rotation + tempDifAngle
  pSRubberB.rotation = pSHoopT.rotation - tempDifAngle
end

on pullbackFrame me
  if not (the mouseDown) then
    setUpSnapping()
    return 
  end if
  newPoint = point(mouseH(), mouseV())
  newPoint = newPoint * 1.0
  newAngle = rotationAngle(newPoint - pSHoopT.loc)
  tempDistance = distance(pSHoopT.loc - newPoint)
  if tempDistance > pStretchLimit then
    tempDistance = pStretchLimit
  else
    if tempDistance < 10 then
      tempDistance = 10
    end if
  end if
  newPoint = findPoint(pSHoopT.loc, newAngle, tempDistance)
  if intersectsPlanets(newPoint) then
    return 
  end if
  if newPoint = pSprite.loc then
    return 
  end if
  pSHoopT.rotation = newAngle
  pSHoopB.rotation = newAngle
  pPoint = newPoint
  pSprite.loc = pPoint
  setRubberBands(tempDistance)
end

on setUpSnapping
  puppetSound(2, "snd_launch")
  pState = #snapping
  pSLS1.visible = 0
  pSLS2.visible = 0
  pSLS3.visible = 0
  pSLS3.loc = pSLS2.loc
  pSLS2.loc = pSLS1.loc
  pSLS1.loc = pSprite.loc
  member("k3").image.fill(0, 0, 17, 26, member("k2").image.getPixel(5, 5))
  member("k2").image.fill(0, 0, 17, 26, member("k1").image.getPixel(5, 5))
  member("k1").image.fill(0, 0, 17, 26, pTraceColor)
  member("k3").image.setAlpha(member("Kev_Alph").image)
  member("k2").image.setAlpha(member("Kev_Alph").image)
  member("k1").image.setAlpha(member("Kev_Alph").image)
  pTries = pTries + 1
  member("fld_tries").word[2] = string(pTries)
  tempPoint = pSHoopT.loc - pSprite.loc
  tempPoint = tempPoint * 100 / pStretchLimit
  tempSpeed = ((tempPoint[1] * tempPoint[1]) + (tempPoint[2] * tempPoint[2])) / 250.0
  tempAngle = rotationAngle(pSHoopT.loc - pSprite.loc)
  tempVector = findPoint(point(0, 0), tempAngle, tempSpeed)
  pVX = tempVector[1]
  pVY = tempVector[2]
  pFrameCount = integer((distance(tempPoint) / distance(point(pVX, pVY))) + 1)
end

on snappingFrame
  pPoint = pPoint + point(pVX, pVY)
  pSprite.loc = pPoint
  pFrameCount = pFrameCount - 1
  if pFrameCount < 1 then
    setUpSoaring()
  else
    setRubberBands(distance(pSprite.loc - pSHoopT.loc))
  end if
  tempHitPlanet = intersectsPlanets(pSprite.loc)
  if tempHitPlanet then
    setUpCrashed(tempHitPlanet)
  end if
end

on mouseDown me
  if pState = #iddle then
    pState = #pullback
  else
    if pState = #soaring then
      pState = #crashed
      pCount = 1
    end if
  end if
end

on getPropertyDescriptionList me
  tempVPList = [:]
  tempVPList.addProp(#pTarget, [#comment: "Target Sprite", #format: #integer, #default: 7])
  tempVPList.addProp(#pBorder, [#comment: "Out of bounds Grace distance:", #format: #integer, #default: 100, #range: [#min: 0, #max: 1000]])
  tempVPList.addProp(#plastLevel, [#comment: "Is this the last level?:", #format: #boolean, #default: 0])
  tempVPList.addProp(#pStretchLimit, [#comment: "Limit of stretch:", #format: #integer, #default: 100, #range: [#min: 30, #max: 120]])
  return tempVPList
end
