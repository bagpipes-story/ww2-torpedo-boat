all () 
{ 
    local f=$1;
    shift;
    local s="";
    for k in $K;
    do
        v=$f;
        for o in "$@";
        do
            [ "${o%%=*}" = "$k" ] && v=$(python3 -c "print($f*${o#*=})");
        done;
        s="$s$k=$v,";
    done;
    echo ${s%,}
}
K="mg gun_near gun_far splash_s splash_l blast_s blast_l torp_hit torp_launch hull_hit alarm light_on flare_pop bomb_fall reload smoke ui_tap bell engine_cough sink"
