property pSprite, pMass, pGReach
global gPlanets

on beginSprite me
  pSprite = sprite(me.spriteNum)
  if gPlanets = VOID then
    gPlanets = []
  end if
  tempReach = (pSprite.width / 2) + pGReach
  if pGReach = 0 then
    tempReach = 5000
  end if
  gPlanets.add([pSprite.spriteNum, pMass, (pSprite.width / 2) + 8, tempReach])
end

on endSprite me
  gPlanets = []
end

on getPropertyDescriptionList
  return [#pMass: [#comment: "Mass of Planet (higher Mass greater gravitational effect):", #format: #integer, #default: 100, #range: [#min: 0, #max: 1000]], #pGReach: [#comment: "Pixel reach of Gravity affect beyond radius (0 infinite):", #format: #integer, #default: 0, #range: [#min: 0, #max: 200]]]
end
