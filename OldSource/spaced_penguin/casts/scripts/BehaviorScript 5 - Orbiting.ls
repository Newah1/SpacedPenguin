property pSprite, pSun, pSun2, pSun3, pVX, pVY, pSuns, pFloatLoc, pGravFactor, pAltMass, pOrigAngle
global gPlanets, gGravitationalConstant

on beginSprite me
  pSprite = sprite(me.spriteNum)
  pSuns = []
  pFloatLoc = pSprite.loc * 1.0
  pSprite.trails = 0
end

on enterFrame me
  if pSuns = [] then
    makeSunList()
  end if
  pLocPrev = pSprite.loc
  tempNumSuns = pSuns.count
  repeat with p = 1 to tempNumSuns
    tempChangeLoc = pSprite.loc - sprite(pSuns[p][1]).loc
    tempDistSquared = (tempChangeLoc[1] * tempChangeLoc[1]) + (tempChangeLoc[2] * tempChangeLoc[2])
    tempGravitationalForce = 0
    if tempDistSquared < (pSuns[p][3] * pSuns[p][3]) then
      tempDistSquared = pSuns[p][3] * pSuns[p][3]
    end if
    tempGravitationalForce = pSuns[p][2] * gGravitationalConstant / (tempDistSquared * pGravFactor)
    pVX = pVX - (tempGravitationalForce * tempChangeLoc[1])
    pVY = pVY - (tempGravitationalForce * tempChangeLoc[2])
  end repeat
  pFloatLoc = pFloatLoc + point(pVX, pVY)
  pSprite.loc = pFloatLoc
end

on makeSunList me
  if pAltMass = 0 then
    tempPlanetsCount = gPlanets.count
    repeat with p = 1 to tempPlanetsCount
      if gPlanets[p][1] = pSun then
        pSuns.add(gPlanets[p])
        next repeat
      end if
      if gPlanets[p][1] = pSun2 then
        pSuns.add(gPlanets[p])
        next repeat
      end if
      if gPlanets[p][1] = pSun3 then
        pSuns.add(gPlanets[p])
      end if
    end repeat
  else
    pSuns = [[pSun, pAltMass, sprite(pSun).width / 2]]
    if pSun2 <> 0 then
      add(pSuns, [pSun2, pAltMass, sprite(pSun2).width / 2])
    end if
    if pSun3 <> 0 then
      add(pSuns, [pSun3, pAltMass, sprite(pSun3).width / 2])
    end if
  end if
end

on getPropertyDescriptionList
  vList = [:]
  vList.addProp(#pSun, [#comment: "Sprite Num of Steller Body this planet Orbits (0 for all):", #format: #integer, #default: 5, #range: [#min: 0, #max: 50]])
  vList.addProp(#pSun2, [#comment: "Steller Body 2 (optional):", #format: #integer, #default: 0, #range: [#min: 0, #max: 50]])
  vList.addProp(#pSun3, [#comment: "Steller Body 3 (optional):", #format: #integer, #default: 0, #range: [#min: 0, #max: 50]])
  vList.addProp(#pVX, [#comment: "Initial Vx:", #format: #float, #default: 1, #range: [#min: -25.0, #max: 25.0]])
  vList.addProp(#pVY, [#comment: "Initial Vy:", #format: #float, #default: 1, #range: [#min: -25.0, #max: 25.0]])
  vList.addProp(#pGravFactor, [#comment: "Gravity Factor (G is divided by it):", #format: #float, #default: 1, #range: [#min: 1, #max: 50]])
  vList.addProp(#pAltMass, [#comment: "Alternative Mass to Use (0 to not use):", #format: #integer, #default: 0, #range: [#min: 0, #max: 1000]])
  return vList
end
