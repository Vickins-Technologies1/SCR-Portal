import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const cookies = request.cookies;
    const currentUserId = cookies.get('userId')?.value;
    const currentRole = cookies.get('role')?.value as 'admin' | 'propertyOwner' | 'tenant' | undefined;
    const originalUserId = cookies.get('originalUserId')?.value;
    const originalRole = cookies.get('originalRole')?.value as 'propertyOwner' | undefined;

    // Check if the user is in an impersonated session
    if (!currentUserId || currentRole !== 'tenant' || !originalUserId || !originalRole) {
      console.log('No valid impersonation session found', {
        currentUserId,
        currentRole,
        originalUserId,
        originalRole,
      });
      return NextResponse.json(
        { success: false, message: 'No valid impersonation session to revert' },
        { status: 400 }
      );
    }

    // Log successful revert attempt
    console.log(`Reverting impersonation - currentUserId: ${currentUserId}, originalUserId: ${originalUserId}, originalRole: ${originalRole}`);

    // Create response and restore original cookies
    const response = NextResponse.json({ success: true });
    response.cookies.set('userId', originalUserId, {
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    response.cookies.set('role', originalRole, {
      path: '/',
      maxAge: 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    // Clear impersonation cookies
    response.cookies.delete('originalUserId');
    response.cookies.delete('originalRole');

    return response;
  } catch (error) {
    console.log('Error in POST /api/impersonate/revert', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}