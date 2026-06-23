import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const phoneToEmail = (phone: string) => {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@wms.local`;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser }, error: callerErr } = await supabaseAdmin.auth.getUser(token);

    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('role, owner_id, id')
      .eq('id', callerUser.id)
      .single();

    const callerRole = callerProfile?.role;
    if (callerRole !== 'admin' && callerRole !== 'warehouse_manager') {
      return new Response(JSON.stringify({ error: 'غير مصرح لك بإنشاء حسابات' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The owner_id for the new worker: admin's own id if they are the root owner,
    // otherwise use the caller's owner_id
    const ownerId = callerProfile?.owner_id ?? callerUser.id;

    const body = await req.json();
    const { phone, full_name, role, max_salary } = body;

    if (!phone || !full_name) {
      return new Response(JSON.stringify({ error: 'رقم الهاتف والاسم مطلوبان' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const email = phoneToEmail(phone);
    const cleanPhone = phone.replace(/\D/g, '');

    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPwd = '';
    for (let i = 0; i < 8; i++) randomPwd += chars[Math.floor(Math.random() * chars.length)];
    randomPwd += '1!';

    console.log(`Creating worker: phone=${phone}, email=${email}, role=${role}, owner_id=${ownerId}`);

    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ error: 'رقم الهاتف مسجل مسبقاً' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: signUpData, error: signUpErr } = await supabaseAnon.auth.signUp({
      email,
      password: randomPwd,
      options: {
        data: {
          full_name,
          phone: cleanPhone,
          role: role || 'worker',
        },
      },
    });

    if (signUpErr) {
      console.error('SignUp error:', signUpErr.message);
      return new Response(JSON.stringify({ error: signUpErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!signUpData.user) {
      return new Response(JSON.stringify({ error: 'فشل إنشاء الحساب' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = signUpData.user.id;

    await supabaseAdmin.rpc('confirm_user_email' as never, { user_id: userId });

    const { error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: userId,
        email,
        username: cleanPhone,
        full_name,
        phone: cleanPhone,
        role: role || 'worker',
        max_salary: max_salary || 0,
        active: true,
        owner_id: ownerId,
      }, { onConflict: 'id' });

    if (profileErr) {
      console.error('Profile upsert error:', profileErr.message);
    }

    console.log(`Worker created: userId=${userId}, owner_id=${ownerId}`);

    return new Response(JSON.stringify({
      success: true,
      userId,
      tempPassword: randomPwd,
      message: 'تم إنشاء الحساب بنجاح',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Unexpected error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
