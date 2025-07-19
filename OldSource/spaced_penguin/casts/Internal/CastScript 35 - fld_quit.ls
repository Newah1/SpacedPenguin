global gAlert

on mouseUp
  if gAlert <> 0 then
    return 
  end if
  dAlert(#reallyquit)
end
