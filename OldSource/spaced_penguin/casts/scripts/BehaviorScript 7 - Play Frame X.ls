property myTargetFrame
global gAlert

on getBehaviorDescription me
  return "PLAY FRAME X" & RETURN & RETURN & "Drop this behavior onto a Sprite, the Stage or into the Script Channel of the Score to start a sequence and move the playback head to a given frame." & RETURN & RETURN & "If you drop it onto a graphic member, the 'play' command is sent when the user clicks on the sprite (on mouseUp)." & RETURN & RETURN & "If you drop it onto the Stage or the Script Channel of the Score, it will be sent when the playback head leaves the frame (on exitFrame)." & RETURN & RETURN & "Use the 'Play Done' behavior to end the sequence and to tell the playback head to return to the current frame." & RETURN & RETURN & "PARAMETERS:" & RETURN & "* Play which frame on mouseUp?" & RETURN & RETURN & "ASSOCIATED BEHAVIORS:" & RETURN & "+ Play Movie X" & RETURN & "+ Play Done"
end

on getBehaviorTooltip me
  return "Use with graphic members or as a frame behavior. " & "Jumps the playback head to the given frame. " & "Acts on mouseUp or on exitFrame, depending on whether you drag it to a sprite or to the Stage. " & "Use the Play Done behavior to return to this frame."
end

on mouseUp me
  if gAlert <> 0 then
    return 
  end if
  play frame myTargetFrame
end

on exitFrame me
  if the currentSpriteNum = 0 then
    play frame myTargetFrame
  end if
end

on isOKToAttach me, aSpriteType, aSpriteNum
  return 1
end

on getPropertyDescriptionList me
  if the currentSpriteNum = 0 then
    theComment = "Play which frame on exitFrame?"
  else
    theComment = "Play which frame on mouseUp?"
  end if
  return [#myTargetFrame: [#comment: theComment, #format: #integer, #default: the frame]]
end
